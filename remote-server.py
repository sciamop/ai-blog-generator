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
from urllib.parse import urljoin
from datetime import datetime
from wordpress_uploader import WordPressImageUploader

load_dotenv()

app = Flask(__name__)
CORS(app)

WP_URL = os.getenv('WP_URL')
WP_USERNAME = os.getenv('WP_USERNAME')
WP_APP_PASSWORD = os.getenv('WP_APP_PASSWORD')
OPENWEBUI_API_URL = os.getenv('OPENWEBUI_API_URL', 'http://localhost:11434/api/chat')
MODEL_NAME = os.getenv('MODEL_NAME', 'social-media-influencer')

uploader = WordPressImageUploader(WP_URL, WP_USERNAME, WP_APP_PASSWORD)

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
    except Exception as e:
        print(f"Error fetching URL content: {e}")
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
                return None
            prompt = f"""Create a social media post ABOUT this content (you are NOT the author of this content):\n{content}\n\nIMPORTANT FORMATTING RULES:\n1. Use LOTS of EMOJIS (at least 5-10) 🎨\n2. Use line breaks between paragraphs\n3. Use CAPS for emphasis\n4. NO thinking or analysis\n7. JUST THE POST!\n8. Remember: You are creating a post ABOUT this content, not AS the author"""
        else:
            prompt = """Write one single social media post.\nIMPORTANT FORMATTING RULES:\n1. Use LOTS of EMOJIS (at least 5-10) 🎨\n2. Use line breaks between paragraphs\n3. Use CAPS for emphasis\n4. NO thinking or analysis\n5. NO hashtags at the end\n6. NO explanations\n7. JUST THE POST!"""
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
            return None
        content = result['message']['content']
        return remove_before_think_end(content)
    except Exception as e:
        print(f"\nError getting content from OpenWebUI: {e}")
        return None

def get_summary_of_webui_content(model_name, content):
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
        print("Warning: Received empty response from model")
        return None
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
    return extracted_json

def get_meta_image_url(page_url):
    try:
        response = requests.get(page_url, timeout=10)
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
    data = request.json
    prompt = data.get('prompt')
    url = data.get('url')
    if url:
        content = get_webui_content(MODEL_NAME, url, is_url=True)
        meta_image_url = get_meta_image_url(url)
    else:
        content = get_webui_content(MODEL_NAME, prompt, is_url=False)
        meta_image_url = ""
    if not content:
        return jsonify({'error': 'Failed to generate content'}), 500
    return jsonify({'content': content, 'meta_image_url': meta_image_url})

@app.route('/confirm-post', methods=['POST'])
def confirm_post():
    data = request.json
    content = data.get('content')
    meta_image_url = data.get('meta_image_url', "")
    if not content:
        return jsonify({'error': 'No content provided'}), 400
    summary_json = get_summary_of_webui_content(MODEL_NAME, content)
    post_data = post_to_wordpress(content, meta_image_url, summary_json)
    if not post_data or not post_data.get('link'):
        return jsonify({'error': 'Failed to post to WordPress'}), 500
    return jsonify({'wordpress_url': post_data['link']})

@app.route('/health', methods=['GET'])
def health():
    return jsonify({'status': 'ok', 'message': 'Python server is running'})

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=8000) 