from flask import Flask, render_template, request, jsonify, session
import requests
import os
import xml.etree.ElementTree as ET
import logging
from dotenv import load_dotenv

load_dotenv() # Load environment variables from .env

from flask_sqlalchemy import SQLAlchemy
from flask_login import LoginManager, UserMixin, login_user, login_required, logout_user, current_user
from werkzeug.security import generate_password_hash, check_password_hash

app = Flask(__name__)
app.secret_key = os.environ.get('SECRET_KEY', os.urandom(24)) # Load from env, fallback to random (dev only)

# Database Config
basedir = os.path.abspath(os.path.dirname(__file__))

# Use DATABASE_URL from env, or fallback to local sqlite
database_url = os.environ.get('DATABASE_URL')
if database_url and database_url.startswith("postgres://"):
    database_url = database_url.replace("postgres://", "postgresql://", 1)

app.config['SQLALCHEMY_DATABASE_URI'] = database_url or 'sqlite:///' + os.path.join(basedir, 'smotrelka.db')
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

db = SQLAlchemy(app)
login_manager = LoginManager()
login_manager.init_app(app)
login_manager.login_view = 'login'

# Models
class User(UserMixin, db.Model):
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(100), unique=True, nullable=False)
    password_hash = db.Column(db.String(200), nullable=False)
    avatar_url = db.Column(db.String(500), default="https://via.placeholder.com/150")

class Like(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    image_url = db.Column(db.String(500), nullable=False)
    thumbnail_url = db.Column(db.String(500), nullable=False)
    source = db.Column(db.String(50), nullable=True) # e.g. 'safebooru'
    post_id = db.Column(db.Integer, nullable=True) # Original ID from booru

class Save(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    image_url = db.Column(db.String(500), nullable=False)
    thumbnail_url = db.Column(db.String(500), nullable=False)
    source = db.Column(db.String(50), nullable=True)
    post_id = db.Column(db.Integer, nullable=True)

@login_manager.user_loader
def load_user(user_id):
    return User.query.get(int(user_id))

# Create DB
with app.app_context():
    db.create_all()

# Booru API Endpoints
SAFEBOORU_URL = "https://safebooru.org/index.php"
GELBOORU_URL = "https://gelbooru.com/index.php"
RULE34_URL = "https://api.rule34.xxx/index.php"

@app.route('/')
def index():
    return render_template('index.html')

# === Auth Endpoints ===
@app.route('/api/register', methods=['POST'])
def register():
    data = request.json
    username = data.get('username')
    password = data.get('password')
    
    if not username or not password:
        return jsonify({'error': 'Missing username or password'}), 400
    
    if User.query.filter_by(username=username).first():
        return jsonify({'error': 'User already exists'}), 400
    
    hashed_pw = generate_password_hash(password)
    new_user = User(username=username, password_hash=hashed_pw)
    db.session.add(new_user)
    db.session.commit()
    
    login_user(new_user)
    return jsonify({'message': 'Registered successfully', 'user': {'username': username, 'avatar': new_user.avatar_url}})

@app.route('/api/login', methods=['POST'])
def login():
    data = request.json
    username = data.get('username')
    password = data.get('password')
    
    user = User.query.filter_by(username=username).first()
    
    if user and check_password_hash(user.password_hash, password):
        login_user(user)
        return jsonify({'message': 'Logged in successfully', 'user': {'username': username, 'avatar': user.avatar_url}})
    
    return jsonify({'error': 'Invalid credentials'}), 401

@app.route('/api/logout', methods=['POST'])
@login_required
def logout():
    logout_user()
    return jsonify({'message': 'Logged out'})

@app.route('/api/user')
def get_current_user():
    if current_user.is_authenticated:
        return jsonify({
            'is_logged_in': True,
            'username': current_user.username,
            'avatar': current_user.avatar_url
        })
    return jsonify({'is_logged_in': False})

@app.route('/api/user/update', methods=['POST'])
@login_required
def update_user():
    data = request.json
    if 'avatar_url' in data:
        current_user.avatar_url = data['avatar_url']
        db.session.commit()
        return jsonify({'message': 'Profile updated', 'avatar': current_user.avatar_url})
    return jsonify({'error': 'No data provided'}), 400

@app.route('/api/posts')
def get_posts():
    source = request.args.get('source', 'safebooru')
    page = request.args.get('page', 1)
    tags = request.args.get('tags', '')
    
    params = {
        'page': 'dapi',
        's': 'post',
        'q': 'index',
        'pid': page,
        'limit': 40,
        'tags': tags,
        'json': 1
    }
    
    if source == 'gelbooru':
        base_url = GELBOORU_URL
        params['api_key'] = os.environ.get('GELBOORU_API_KEY')
        params['user_id'] = os.environ.get('GELBOORU_USER_ID')
    elif source == 'rule34':
        base_url = RULE34_URL
        params['api_key'] = os.environ.get('RULE34_API_KEY')
        params['user_id'] = os.environ.get('RULE34_USER_ID')
    else:
        base_url = SAFEBOORU_URL

    try:
        resp = requests.get(base_url, params=params, headers={'User-Agent': 'BooruViewer/1.0'})
        resp.raise_for_status()
        
        data = resp.json()
        
        posts = []
        raw_list = []
        
        if isinstance(data, list):
            raw_list = data
        elif isinstance(data, dict):
            if 'post' in data:
                raw_list = data['post']
        
        for p in raw_list:
            image_url = p.get('file_url')
            preview_url = p.get('preview_url')
            
            # Fallback URL construction
            if not image_url:
                if source == 'safebooru':
                    if 'directory' in p and 'image' in p:
                         image_url = f"https://safebooru.org/images/{p['directory']}/{p['image']}"
                elif source == 'gelbooru':
                    if 'directory' in p and 'image' in p:
                        image_url = f"https://img3.gelbooru.com/images/{p['directory']}/{p['image']}"
                elif source == 'rule34':
                    # Rule34 usually provides file_url. Fallback:
                    if 'directory' in p and 'image' in p:
                        image_url = f"https://wimg.rule34.xxx/images/{p['directory']}/{p['image']}"

            if not preview_url:
                 if source == 'safebooru':
                     if 'directory' in p and 'image' in p:
                         preview_url = f"https://safebooru.org/thumbnails/{p['directory']}/thumbnail_{p['image']}"
                 elif source == 'gelbooru':
                     if 'directory' in p and 'image' in p:
                         preview_url = f"https://img3.gelbooru.com/thumbnails/{p['directory']}/thumbnail_{p['image']}"
                 elif source == 'rule34':
                     if 'directory' in p and 'image' in p:
                         preview_url = f"https://wimg.rule34.xxx/thumbnails/{p['directory']}/thumbnail_{p['image']}"
            
            # Debugging Gelbooru/Rule34
            if source in ['gelbooru', 'rule34']:
                print(f"[{source}] ID: {p.get('id')} | Img: {image_url} | Prev: {preview_url}")

            if image_url and preview_url:
                posts.append({
                    'id': p.get('id'),
                    'preview_url': preview_url,
                    'file_url': image_url,
                    'tags': p.get('tags', ''),
                    'width': p.get('width'),
                    'height': p.get('height')
                })
                
        return jsonify(posts)

    except Exception as e:
        print(f"Error fetching from {source}: {e}")
        # Return empty list on error to handle gracefully
        return jsonify([])

# === Interaction Endpoints ===

@app.route('/api/like', methods=['POST'])
@login_required
def toggle_like():
    data = request.json
    image_url = data.get('image_url')
    thumbnail_url = data.get('thumbnail_url')
    source = data.get('source')
    post_id = data.get('post_id')

    if not image_url:
        return jsonify({'error': 'Missing image_url'}), 400

    # Check if exists
    existing = Like.query.filter_by(user_id=current_user.id, image_url=image_url).first()
    if existing:
        db.session.delete(existing)
        db.session.commit()
        return jsonify({'liked': False, 'message': 'Unliked'})
    else:
        new_like = Like(user_id=current_user.id, image_url=image_url, thumbnail_url=thumbnail_url, source=source, post_id=post_id)
        db.session.add(new_like)
        db.session.commit()
        return jsonify({'liked': True, 'message': 'Liked'})

@app.route('/api/save', methods=['POST'])
@login_required
def toggle_save():
    data = request.json
    image_url = data.get('image_url')
    thumbnail_url = data.get('thumbnail_url')
    source = data.get('source')
    post_id = data.get('post_id')

    if not image_url:
        return jsonify({'error': 'Missing image_url'}), 400

    existing = Save.query.filter_by(user_id=current_user.id, image_url=image_url).first()
    if existing:
        db.session.delete(existing)
        db.session.commit()
        return jsonify({'saved': False, 'message': 'Removed from saved'})
    else:
        new_save = Save(user_id=current_user.id, image_url=image_url, thumbnail_url=thumbnail_url, source=source, post_id=post_id)
        db.session.add(new_save)
        db.session.commit()
        return jsonify({'saved': True, 'message': 'Saved'})

@app.route('/api/user/likes')
@login_required
def get_user_likes():
    likes = Like.query.filter_by(user_id=current_user.id).all()
    # Convert to format compatible with gallery
    posts = [{
        'id': l.post_id,
        'preview_url': l.thumbnail_url,
        'file_url': l.image_url,
        'source': l.source,
        'tags': '' # Storing tags would be better but URL is minimal
    } for l in likes]
    # Reverse to show newest first
    return jsonify(posts[::-1])

@app.route('/api/user/saved')
@login_required
def get_user_saved():
    saves = Save.query.filter_by(user_id=current_user.id).all()
    posts = [{
        'id': s.post_id,
        'preview_url': s.thumbnail_url,
        'file_url': s.image_url,
        'source': s.source,
        'tags': ''
    } for s in saves]
    return jsonify(posts[::-1])

if __name__ == '__main__':
    app.run(host="127.0.0.1", port=5001, debug=True)
