import os
from flask import Flask, request, jsonify
from flask_cors import CORS
from dotenv import load_dotenv
import requests
from requests.auth import HTTPBasicAuth
from bs4 import BeautifulSoup
import re
import time
import json
from urllib.parse import urljoin, urlparse
from datetime import datetime
from wordpress_uploader import WordPressImageUploader
import xml.etree.ElementTree as ET

load_dotenv()

app = Flask(__name__)
CORS(app)

WP_URL = os.getenv('WP_URL')
WP_USERNAME = os.getenv('WP_USERNAME')
WP_APP_PASSWORD = os.getenv('WP_APP_PASSWORD')
OPENWEBUI_API_URL = os.getenv('OPENWEBUI_API_URL', 'http://localhost:11434/api/chat')
MODEL_NAME = os.getenv('MODEL_NAME', 'social-media-influencer-32b')

uploader = WordPressImageUploader(WP_URL, WP_USERNAME, WP_APP_PASSWORD)

def get_domain_from_url(url):
    """Extract domain from URL"""
    try:
        parsed = urlparse(url)
        return parsed.netloc.lower()
    except:
        return None

def load_blacklist():
    """Load blacklisted domains from XML file"""
    try:
        if not os.path.exists('blacklist.xml'):
            return set()
        
        tree = ET.parse('blacklist.xml')
        root = tree.getroot()
        domains = set()
        
        for domain_elem in root.findall('.//domain'):
            domains.add(domain_elem.text.lower())
        
        return domains
    except Exception as e:
        print(f"Error loading blacklist: {e}")
        return set()

def save_blacklist(domains):
    """Save blacklisted domains to XML file"""
    try:
        root = ET.Element('blacklist')
        domains_elem = ET.SubElement(root, 'domains')
        
        for domain in sorted(domains):
            domain_elem = ET.SubElement(domains_elem, 'domain')
            domain_elem.text = domain
        
        last_updated = ET.SubElement(root, 'last_updated')
        last_updated.text = datetime.now().isoformat() + 'Z'
        
        tree = ET.ElementTree(root)
        tree.write('blacklist.xml', encoding='UTF-8', xml_declaration=True)
        
    except Exception as e:
        print(f"Error saving blacklist: {e}")

def add_to_blacklist(domain):
    """Add a domain to the blacklist"""
    if not domain:
        return
    
    domains = load_blacklist()
    domains.add(domain.lower())
    save_blacklist(domains)
    print(f"Added {domain} to blacklist")

def is_blacklisted(url):
    """Check if a URL's domain is blacklisted"""
    domain = get_domain_from_url(url)
    if not domain:
        return False
    
    blacklisted_domains = load_blacklist()
    return domain.lower() in blacklisted_domains

def save_url_as_clean_file(url, content, folder="downloads"):
    # Generate filename
    timestamp = int(time.time())
    # Strip non-alphanumerics
    stripped = re.sub(r'\W+', '', url)
    # Take first and last 16 characters
    prefix = stripped[:16]
    suffix = stripped[-16:] if len(stripped) > 16 else stripped
    filename = f"{prefix}_{suffix}_{timestamp}.html"
    
    # Ensure folder exists
    os.makedirs(folder, exist_ok=True)
    filepath = os.path.join(folder, filename)
    
    # Save the file
    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(content)
    
    print(f"Saved to {filepath}")
    return filepath

def fetch_url_content(url):
    try:
        headers = {
            "Accept": "*/*",
            "Accept-Encoding": "gzip, deflate",
            "Accept-Language": "en-US,en;q=0.9",
            "Connection": "keep-alive",
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:136.0) Gecko/20100101 Firefox/136.0'
        }
        response = requests.get(url, headers=headers)
        response.raise_for_status()
        soup = BeautifulSoup(response.text, 'html.parser')
        for script in soup(["script", "style"]):
            script.decompose()
        text = soup.get_text()
        lines = (line.strip() for line in text.splitlines())
        chunks = (phrase.strip() for line in lines for phrase in line.split("  "))
        joined_chunks = ' '.join(chunk for chunk in chunks if chunk)
        
        # Save the cleaned content to file
        save_url_as_clean_file(url, joined_chunks)
        
        return joined_chunks
    except requests.exceptions.HTTPError as e:
        print(f"HTTP Error fetching URL content: {e} - Status Code: {e.response.status_code}")
        # Add domain to blacklist for 403, 429, 451, and other blocking errors
        if e.response.status_code in [403, 429, 451, 503, 502, 504]:
            domain = get_domain_from_url(url)
            if domain:
                add_to_blacklist(domain)
        return None
    except Exception as e:
        print(f"Error fetching URL content: {e}")
        # Add domain to blacklist for connection errors, timeouts, etc.
        domain = get_domain_from_url(url)
        if domain:
            add_to_blacklist(domain)
        return None

def remove_before_think_end(text):
    if '</think>' in text:
        return text.split('</think>', 1)[1].strip()
    return text

def get_webui_content(model_name, input_source=None, is_url=False):
    try:
        if is_url and input_source:
            content = fetch_url_content(input_source)
            if not content:
                print("Warning: Failed to fetch URL content")
                return "Failed to fetch content from the provided URL. Please try again or use a different URL."
            prompt = f"""Create a social media post ABOUT this content (you are NOT the author of this content):\n{content}\n\nIMPORTANT FORMATTING RULES:\n1. Use LOTS of EMOJIS (at least 5-10) 🎨\n2. Use line breaks between paragraphs\n3. Use CAPS for emphasis\n4. NO thinking or analysis\n7. JUST THE POST!\n8. Remember: You are creating a post ABOUT this content, not AS the author"""
        else:
            if not input_source:
                return "Please provide a prompt or URL to generate content."
            prompt = f"""Write one single social media post about: {input_source}\nIMPORTANT FORMATTING RULES:\n1. Use LOTS of EMOJIS (at least 5-10) 🎨\n2. Use line breaks between paragraphs\n3. Use CAPS for emphasis\n4. NO thinking or analysis\n5. NO hashtags at the end\n6. NO explanations\n7. JUST THE POST!"""
        
        messages = [
            {
                "role": "system",
                "content": "You are a social media influencer who creates fun, engaging posts.\nIMPORTANT: NEVER include your thinking process, analysis, or explanations.\nJUST write the post directly with lots of emojis and enthusiasm!"
            },
            {
                "role": "user",
                "content": prompt
            }
        ]
        payload = {
            "model": model_name,
            "messages": messages,
            "stream": False,
            "options": {
                "num_ctx": 4096,
                "num_predict": 2000,
                "temperature": 0.9,
                "top_p": 0.9,
                "top_k": 40,
                "repeat_penalty": 1.1,
                "seed": -1,
                "clear": True
            }
        }
        response = requests.post(OPENWEBUI_API_URL, json=payload)
        response.raise_for_status()
        result = response.json()
        if not result.get('message', {}).get('content'):
            print("Warning: Received empty response from model")
            return "The AI model returned an empty response. Please try again."
        content = result['message']['content']
        cleaned_content = remove_before_think_end(content)
        if not cleaned_content:
            return "The AI model generated content but it was empty after processing. Please try again."
        return cleaned_content
    except Exception as e:
        print(f"\nError getting content from OpenWebUI: {e}")
        return f"Error generating content: {str(e)}. Please try again."

def get_summary_of_webui_content(model_name, content):
    try:
        if not content:
            return json.dumps({
                'result': {
                    'summary': 'Blog Post',
                    'category': 'General',
                    'category_description': 'General blog posts'
                }
            })
            
        prompt = f"Summarize this into a SINGLE short 256 character long sentence: {content}"
        messages = [
            {
                "role": "system",
                "content": """The user will provide the text of a blog post that they would like to summarize. \nPlease respond with a JSON object containing exactly these fields:\n- \"summary\": A 32 word or less summary of the post\n- \"category\": A one or two word category for the post\n- \"category_description\": a short description of the category\nRespond using this JSON schema:\n{\n    \"result\": {\n        \"summary\": {\"type\": \"string\"},\n        \"category\": {\"type\": \"string\"},\n        \"category_description\": {\"type\": \"string\"},\n    }\n}\nReturn a JSON response. The response must:\n- Be valid JSON that can be parsed\n- Include fields: \"summary\", \"category\", \"category_description\"\n- Have no additional text outside the JSON\n- Do NOT include markdown code blocks (```json) or comments"""
            },
            {
                "role": "user",
                "content": prompt
            }
        ]
        payload = {
            "model": model_name,
            "messages": messages,
            "stream": False,
            "options": {
                "num_ctx": 4096,
                "num_predict": 2000,
                "temperature": 0.2,
                "top_p": 0.9,
                "top_k": 40,
                "repeat_penalty": 1.1,
                "seed": -1,
                "clear": True
            }
        }
        response = requests.post(OPENWEBUI_API_URL, json=payload)
        response.raise_for_status()
        result = response.json()
        if not result.get('message', {}).get('content'):
            print("Warning: Received empty response from model for summary")
            return json.dumps({
                'result': {
                    'summary': 'Blog Post',
                    'category': 'General',
                    'category_description': 'General blog posts'
                }
            })
        content = result['message']['content']
        cleaned_content = remove_before_think_end(content)
        
        def extract_json_from_text(text):
            json_block_match = re.search(r'```(?:json)?\s*(\{.*?\})\s*```', text, re.DOTALL)
            if json_block_match:
                return json_block_match.group(1)
            brace_start = text.find('{')
            if brace_start != -1:
                brace_count = 0
                for i, char in enumerate(text[brace_start:], brace_start):
                    if char == '{':
                        brace_count += 1
                    elif char == '}':
                        brace_count -= 1
                        if brace_count == 0:
                            return text[brace_start:i+1]
            bracket_start = text.find('[')
            if bracket_start != -1:
                bracket_count = 0
                for i, char in enumerate(text[bracket_start:], bracket_start):
                    if char == '[':
                        bracket_count += 1
                    elif char == ']':
                        bracket_count -= 1
                        if bracket_count == 0:
                            return text[bracket_start:i+1]
            cleaned = re.sub(r'```json\s*', '', text)
            cleaned = re.sub(r'```\s*$', '', cleaned)
            cleaned = re.sub(r'//.*$', '', cleaned, flags=re.MULTILINE)
            cleaned = re.sub(r'/\*.*?\*/', '', cleaned, flags=re.DOTALL)
            return cleaned.strip()
        
        extracted_json = extract_json_from_text(cleaned_content)
        if not extracted_json:
            return json.dumps({
                'result': {
                    'summary': 'Blog Post',
                    'category': 'General',
                    'category_description': 'General blog posts'
                }
            })
        return extracted_json
        
    except Exception as e:
        print(f"Error getting summary from OpenWebUI: {e}")
        return json.dumps({
            'result': {
                'summary': 'Blog Post',
                'category': 'General',
                'category_description': 'General blog posts'
            }
        })

def get_meta_image_url(page_url):
    try:
        headers = {
            "Accept": "*/*",
            "Accept-Encoding": "gzip, deflate",
            "Accept-Language": "en-US,en;q=0.9",
            "Connection": "keep-alive",
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:136.0) Gecko/20100101 Firefox/136.0'
        }
        response = requests.get(page_url, headers=headers, timeout=10)
        if response.status_code != 200:
            return ""
        soup = BeautifulSoup(response.text, 'html.parser')
        meta_props = [
            ("property", "og:image"),
            ("name", "twitter:image"),
            ("name", "image"),
        ]
        for attr, key in meta_props:
            tag = soup.find("meta", attrs={attr: key})
            if tag and tag.get("content"):
                return urljoin(page_url, tag["content"])
        return ""
    except Exception as e:
        print(f"Error fetching meta image: {e}")
        return ""

def get_or_create_category(category_name, summary_json):
    categories_endpoint = f"{WP_URL}/wp-json/wp/v2/categories"
    response = requests.get(
        categories_endpoint,
        auth=HTTPBasicAuth(WP_USERNAME, WP_APP_PASSWORD)
    )
    categories = response.json()
    for category in categories:
        if category['name'].lower() == category_name.lower():
            return category['id']
    try:
        summary_data = json.loads(summary_json)
        category_description = summary_data['result'].get('category_description', '')
    except (json.JSONDecodeError, KeyError, NameError):
        category_description = ''
    new_category = {
        'name': category_name,
        'slug': category_name.lower().replace(' ', '-'),
        'description': category_description
    }
    response = requests.post(
        categories_endpoint,
        auth=HTTPBasicAuth(WP_USERNAME, WP_APP_PASSWORD),
        json=new_category
    )
    if response.status_code == 201:
        return response.json()['id']
    else:
        print(f"Failed to create category: {response.text}")
        return 1

def post_to_wordpress(content, meta_image_url, summary_json):
    try:
        summary_data = json.loads(summary_json)
        title = summary_data['result']['summary']
        if 'category' in summary_data['result']:
            category_id = get_or_create_category(summary_data['result']['category'], summary_json)
            categories = [category_id]
        else:
            categories = [1]
    except (json.JSONDecodeError, KeyError) as e:
        print(f"Error parsing summary JSON: {e}")
        title = "Blog Post " + datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        categories = [1]
    if meta_image_url:
        image_path = uploader.download_image(meta_image_url)
        time_stamp = str(int(time.time()))
        media_data = uploader.upload_to_media_library(image_path, 'image' + time_stamp, 'no title')
        try:
            post_data = uploader.create_post(title, content, media_data['id'], 'publish', categories)
        except:
            post_data = uploader.create_post(title, content, None, 'publish', categories)
    else:
        post_data = uploader.create_post(title, content, None, 'publish', categories)
    return post_data

@app.route('/generate', methods=['POST'])
def generate():
    try:
        print("=== GENERATE ENDPOINT CALLED ===")
        data = request.json
        print(f"Request data: {data}")
        
        if not data:
            print("No data provided")
            return jsonify({'error': 'No data provided'}), 400
            
        prompt = data.get('prompt')
        url = data.get('url')
        print(f"Prompt: {prompt}")
        print(f"URL: {url}")
        
        if not prompt and not url:
            print("Neither prompt nor URL provided")
            return jsonify({'error': 'Either prompt or url must be provided'}), 400
        
        if url:
            # Check if domain is blacklisted
            if is_blacklisted(url):
                domain = get_domain_from_url(url)
                print(f"Domain {domain} is blacklisted")
                return jsonify({
                    'error': f'Domain {domain} is blacklisted due to previous errors',
                    'blacklisted_domain': domain,
                    'error_type': 'blacklisted'
                }), 400
            
            print("Generating content from URL...")
            content = get_webui_content(MODEL_NAME, url, is_url=True)
            meta_image_url = get_meta_image_url(url)
        else:
            print("Generating content from prompt...")
            content = get_webui_content(MODEL_NAME, prompt, is_url=False)
            meta_image_url = ""
        
        print(f"Generated content length: {len(content) if content else 0}")
        print(f"Meta image URL: {meta_image_url}")
        
        if not content:
            print("No content generated")
            return jsonify({'error': 'Failed to generate content'}), 500
        
        # Generate title and category along with content
        print("Generating summary...")
        summary_json = get_summary_of_webui_content(MODEL_NAME, content)
        print(f"Summary JSON: {summary_json}")
        
        # Parse the summary JSON to extract title and category
        title = ""
        category = ""
        try:
            if summary_json:
                summary_data = json.loads(summary_json)
                title = summary_data['result']['summary']
                category = summary_data['result'].get('category', '')
                print(f"Parsed title: {title}")
                print(f"Parsed category: {category}")
        except (json.JSONDecodeError, KeyError) as e:
            print(f"Error parsing summary JSON: {e}")
            title = "Blog Post " + datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            category = "General"
        
        # Ensure all values are strings and not None
        response_data = {
            'content': str(content) if content else '',
            'meta_image_url': str(meta_image_url) if meta_image_url else '',
            'title': str(title) if title else 'Blog Post',
            'category': str(category) if category else 'General'
        }
        
        print(f"Final response data: {response_data}")
        print("=== GENERATE ENDPOINT COMPLETED ===")
        
        return jsonify(response_data)
        
    except Exception as e:
        print(f"Error in generate endpoint: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': f'Internal server error: {str(e)}'}), 500

@app.route('/regenerate-title', methods=['POST'])
def regenerate_title():
    try:
        data = request.json
        content = data.get('content')
        if not content:
            return jsonify({'error': 'No content provided'}), 400
        
        # Generate new title using the summary function
        summary_json = get_summary_of_webui_content(MODEL_NAME, content)
        
        try:
            if summary_json:
                summary_data = json.loads(summary_json)
                title = summary_data['result']['summary']
            else:
                title = "Blog Post " + datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        except (json.JSONDecodeError, KeyError) as e:
            print(f"Error parsing summary JSON: {e}")
            title = "Blog Post " + datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        
        return jsonify({'title': title})
        
    except Exception as e:
        print(f"Error in regenerate_title endpoint: {e}")
        return jsonify({'error': f'Internal server error: {str(e)}'}), 500

@app.route('/regenerate-category', methods=['POST'])
def regenerate_category():
    try:
        data = request.json
        content = data.get('content')
        if not content:
            return jsonify({'error': 'No content provided'}), 400
        
        # Generate new category using the summary function
        summary_json = get_summary_of_webui_content(MODEL_NAME, content)
        
        try:
            if summary_json:
                summary_data = json.loads(summary_json)
                category = summary_data['result'].get('category', 'General')
            else:
                category = "General"
        except (json.JSONDecodeError, KeyError) as e:
            print(f"Error parsing summary JSON: {e}")
            category = "General"
        
        return jsonify({'category': category})
        
    except Exception as e:
        print(f"Error in regenerate_category endpoint: {e}")
        return jsonify({'error': f'Internal server error: {str(e)}'}), 500

@app.route('/confirm-post', methods=['POST'])
def confirm_post():
    data = request.json
    content = data.get('content')
    meta_image_url = data.get('meta_image_url', "")
    title = data.get('title', "")
    category = data.get('category', "")
    if not content:
        return jsonify({'error': 'No content provided'}), 400
    
    # Use provided title and category, or generate if not provided
    if title and category:
        # Create summary JSON with provided title and category
        summary_json = json.dumps({
            'result': {
                'summary': title,
                'category': category,
                'category_description': f'Posts about {category}'
            }
        })
    else:
        # Fallback to generating summary if title/category not provided
        summary_json = get_summary_of_webui_content(MODEL_NAME, content)
    
    post_data = post_to_wordpress(content, meta_image_url, summary_json)
    if not post_data or not post_data.get('link'):
        return jsonify({'error': 'Failed to post to WordPress'}), 500
    return jsonify({'wordpress_url': post_data['link']})

@app.route('/health', methods=['GET'])
def health():
    return jsonify({'status': 'ok', 'message': 'Python server is running'})

@app.route('/test', methods=['GET'])
def test():
    return jsonify({'test': 'success', 'timestamp': datetime.now().isoformat()})

@app.route('/debug', methods=['GET'])
def debug():
    """Simple debug endpoint to test JSON responses"""
    return jsonify({
        'status': 'ok',
        'message': 'Debug endpoint working',
        'timestamp': datetime.now().isoformat(),
        'model_name': MODEL_NAME,
        'openwebui_url': OPENWEBUI_API_URL
    })

@app.route('/blacklist', methods=['GET'])
def get_blacklist_endpoint():
    """Get current blacklisted domains"""
    domains = load_blacklist()
    return jsonify({
        'blacklisted_domains': list(domains),
        'count': len(domains)
    })

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=8000) 