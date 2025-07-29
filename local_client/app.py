#!/usr/bin/env python3
"""
Andy API Local Client - Fixed Version
A web-based interface for hosting Ollama models and connecting to the Andy API pool
This version uses a robust, verified connection protocol.
"""

import os
import json
import time
import threading
import requests
from datetime import datetime
from flask import Flask, render_template, request, jsonify, redirect, url_for, send_from_directory
from dataclasses import dataclass, asdict
from typing import Dict, List, Optional
import sqlite3
import logging
from urllib.parse import unquote
import uuid

# Optional imports for system monitoring
try:
    import psutil
    PSUTIL_AVAILABLE = True
except ImportError:
    PSUTIL_AVAILABLE = False
    
try:
    import GPUtil
    GPUTIL_AVAILABLE = True
except ImportError:
    GPUTIL_AVAILABLE = False

# Set up logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

app = Flask(__name__)
app.secret_key = 'andy-local-client-secret-key'

# Configuration
CONFIG_FILE = 'local_client/client_config.json'
DB_FILE = 'local_client/local_client.db'
DEFAULT_ANDY_API_URL = 'http://localhost:3002'
DEFAULT_OLLAMA_URL = 'http://localhost:11434'

@dataclass
class ModelConfig:
    name: str
    enabled: bool = False
    supports_embedding: bool = False
    supports_vision: bool = False
    supports_audio: bool = False
    max_concurrent: int = 2
    context_length: int = 4096
    quantization: str = "unknown"

@dataclass
class ClientStats:
    total_requests: int = 0
    successful_requests: int = 0
    failed_requests: int = 0
    total_tokens: int = 0
    average_tokens_per_second: float = 0.0
    last_request_time: Optional[datetime] = None
    uptime_start: datetime = datetime.now()

class LocalClient:
    def __init__(self):
        self.config = self.load_config()
        self.models: Dict[str, ModelConfig] = {}
        self.stats = ClientStats()
        self.is_connected = False
        self.host_id = None
        self.running = False
        self.connection_thread = None
        self.status_thread = None
        self.work_thread = None
        self.client_uuid = self.load_or_create_uuid()
        
        self.init_database()
        self.discover_models()

    def load_config(self) -> dict:
        default_config = {
            'andy_api_url': DEFAULT_ANDY_API_URL, 'ollama_url': DEFAULT_OLLAMA_URL,
            'client_name': 'Unnamed Client', 'auto_connect': False, 'max_vram_gb': 0, 'report_interval': 30
        }
        config = default_config.copy()
        if os.path.exists(CONFIG_FILE):
            try:
                with open(CONFIG_FILE, 'r') as f: config.update(json.load(f))
            except Exception as e: logger.error(f"Error loading config: {e}")
        
        if 'ANDY_API_URL' in os.environ: config['andy_api_url'] = os.environ['ANDY_API_URL']
        if 'OLLAMA_URL' in os.environ: config['ollama_url'] = os.environ['OLLAMA_URL']
        if 'FLASK_PORT' in os.environ: config['flask_port'] = int(os.environ['FLASK_PORT'])

        logger.info(f"Using Andy API URL: {config['andy_api_url']}")
        logger.info(f"Using Ollama URL: {config['ollama_url']}")
        return config

    def save_config(self):
        try:
            with open(CONFIG_FILE, 'w') as f: json.dump(self.config, f, indent=2)
        except Exception as e: logger.error(f"Error saving config: {e}")

    def init_database(self):
        try:
            with sqlite3.connect(DB_FILE) as conn:
                conn.execute('''
                    CREATE TABLE IF NOT EXISTS requests (
                        id INTEGER PRIMARY KEY AUTOINCREMENT, timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
                        model_name TEXT, request_type TEXT, tokens INTEGER, response_time REAL, success BOOLEAN
                    )
                ''')
        except Exception as e: logger.error(f"Database initialization error: {e}")

    def discover_models(self):
        try:
            response = requests.get(f"{self.config['ollama_url']}/api/tags", timeout=10)
            if response.status_code == 200:
                data = response.json()
                current_models = set(self.models.keys())
                discovered_models = set()
                for model_data in data.get('models', []):
                    model_name = model_data['name']
                    discovered_models.add(model_name)
                    
                    # Determine if the model supports embedding based on its name
                    is_embedding_model = "embed" in model_name.lower()
                    
                    if model_name not in self.models:
                        self.models[model_name] = ModelConfig(
                            name=model_name, 
                            enabled=False,
                            supports_embedding=is_embedding_model, # Set based on name
                            context_length=model_data.get('details', {}).get('parameter_size', 4096),
                            quantization=model_data.get('details', {}).get('quantization_level', 'unknown')
                        )
                    else:
                        # Update existing model's embedding support if it was previously unknown
                        if not self.models[model_name].supports_embedding and is_embedding_model:
                            self.models[model_name].supports_embedding = True
                
                for model_name in current_models - discovered_models:
                    if model_name in self.models: del self.models[model_name]
                
                if not any(m.enabled for m in self.models.values()) and self.models:
                    # Prefer enabling our test model if available
                    target_model = "sweaterdog/andy-4:micro-q5_k_m"
                    if target_model in self.models:
                        self.models[target_model].enabled = True
                        logger.info(f"Auto-enabled target model for testing: {target_model}")
                    else:
                        first_model_name = next(iter(self.models.keys()))
                        self.models[first_model_name].enabled = True
                        logger.info(f"Auto-enabled model for testing: {first_model_name}")
                
                # Also enable the embedding model for completeness
                embed_model = "nomic-embed-text:latest"
                if embed_model in self.models:
                    self.models[embed_model].enabled = True
                    # Ensure it's marked as embedding if it's the nomic model
                    self.models[embed_model].supports_embedding = True 
                    logger.info(f"Auto-enabled embedding model: {embed_model}")
                logger.info(f"Discovered {len(self.models)} models")
            else:
                logger.error(f"Failed to discover models from Ollama: {response.status_code}")
        except Exception as e: logger.error(f"Error discovering models: {e}")

    def load_or_create_uuid(self):
        uuid_file = 'local_client/client_uuid.txt'
        if os.path.exists(uuid_file):
            with open(uuid_file, 'r') as f: return f.read().strip()
        new_uuid = str(uuid.uuid4())
        with open(uuid_file, 'w') as f: f.write(new_uuid)
        return new_uuid

    def get_fresh_config(self) -> dict:
        return self.load_config()

    def connect_to_pool(self):
        if self.is_connected:
            logger.info("Already connected.")
            return True

        config = self.get_fresh_config()
        logger.info(f"Attempting to connect to Andy API at: {config['andy_api_url']}")
        
        enabled_models = [asdict(model) for model in self.models.values() if model.enabled]
        if not enabled_models:
            logger.error("Cannot connect: No models are enabled.")
            return False

        # Dynamically determine capabilities based on enabled models
        client_capabilities = set()
        for model in self.models.values():
            if model.enabled:
                # Assume all enabled models support text generation unless explicitly an embedding-only model
                if not model.supports_embedding or model.supports_vision or model.supports_audio:
                    client_capabilities.add('text')
                if model.supports_embedding: client_capabilities.add('embedding')
                if model.supports_vision: client_capabilities.add('vision')
                if model.supports_audio: client_capabilities.add('audio')
        
        # If no specific capabilities are found but models are enabled, default to 'text'
        if not client_capabilities and enabled_models:
            client_capabilities.add('text')

        payload = {
            'info': {
                'models': enabled_models, 'max_clients': sum(m['max_concurrent'] for m in enabled_models),
                'endpoint': config['ollama_url'], 'capabilities': list(client_capabilities),
                'vram_total_gb': config.get('max_vram_gb', 0), 'client_uuid': self.client_uuid,
                'client_name': config.get('client_name', 'Unnamed Client')
            }
        }
        
        try:
            logger.info("Joining the pool...")
            response = requests.post(f"{config['andy_api_url']}/api/andy/join_pool", json=payload, timeout=30)
            if response.status_code != 200:
                logger.error(f"Failed to join pool: {response.status_code} - {response.text}")
                return False

            response_data = response.json()
            received_host_id = response_data.get('host_id')
            if not received_host_id:
                logger.error("Failed to connect: Server did not provide a host_id.")
                return False

            logger.info(f"Received host_id: {received_host_id}. Verifying connection with pings...")
            
            # --- Verification Loop ---
            for i in range(5):
                time.sleep(0.5 + i * 0.5) # Patient, staggered delay
                ping_payload = {'host_id': received_host_id, 'current_load': 0, 'status': 'active'}
                try:
                    ping_response = requests.post(f"{config['andy_api_url']}/api/andy/ping_pool", json=ping_payload, timeout=5)
                    if ping_response.status_code == 200:
                        logger.info(f"Connection verified with ping on attempt {i+1}.")
                        self.host_id = received_host_id
                        self.is_connected = True
                        return True
                    logger.warning(f"Ping verification attempt {i+1} failed with status {ping_response.status_code}. Retrying...")
                except requests.RequestException as ping_e:
                    logger.warning(f"Ping verification attempt {i+1} failed with network error: {ping_e}. Retrying...")
            
            logger.error("Failed to verify connection after multiple ping attempts. Aborting connection.")
            return False

        except Exception as e:
            logger.error(f"Error during connection process: {e}", exc_info=True)
            return False

    def disconnect_from_pool(self):
        if not self.is_connected or not self.host_id:
            self.is_connected = False
            self.host_id = None
            return True
            
        try:
            requests.post(f"{self.config['andy_api_url']}/api/andy/leave_pool", json={'host_id': self.host_id}, timeout=10)
            logger.info(f"Successfully disconnected from Andy API pool (host_id: {self.host_id})")
        except Exception as e:
            logger.error(f"Error disconnecting from pool: {e}")
        
        self.is_connected = False
        self.host_id = None
        return True

    def report_status(self):
        if not self.is_connected or not self.host_id: return
        try:
            payload = {'host_id': self.host_id, 'current_load': sum(1 for m in self.models.values() if m.enabled), 'status': 'active'}
            response = requests.post(f"{self.config['andy_api_url']}/api/andy/ping_pool", json=payload, timeout=10)
            if response.status_code == 404:
                logger.warning(f"Host not found in pool (host_id: {self.host_id}), marking as disconnected.")
                self.is_connected = False
                self.host_id = None
        except Exception as e:
            logger.error(f"Error pinging pool: {e}")

    def start_background_threads(self):
        if self.running: return
        self.running = True
        self.connection_thread = threading.Thread(target=self._connection_loop, daemon=True)
        self.status_thread = threading.Thread(target=self._status_loop, daemon=True)
        self.work_thread = threading.Thread(target=self._work_polling_loop, daemon=True)
        self.connection_thread.start()
        self.status_thread.start()
        self.work_thread.start()
        logger.info("Background threads started")

    def stop_background_threads(self):
        self.running = False
        logger.info("Background threads stopped")

    def _connection_loop(self):
        logger.info(f"Connection loop started. Auto-connect: {self.config.get('auto_connect')}, Connected: {self.is_connected}")
        # Attempt to connect immediately on startup
        if self.config.get('auto_connect') and not self.is_connected:
            logger.info("Auto-connect is ON. Attempting initial connection to pool...")
            try:
                self.connect_to_pool()
            except Exception as e:
                logger.error(f"Error during initial connection attempt: {e}")
        
        while self.running:
            if self.config.get('auto_connect') and not self.is_connected:
                logger.info("Auto-connect is ON. Attempting to reconnect to pool...")
                try:
                    self.connect_to_pool()
                except Exception as e:
                    logger.error(f"Error during reconnection attempt: {e}")
            time.sleep(30)  # Check more frequently

    def _status_loop(self):
        while self.running:
            if self.is_connected: self.report_status()
            time.sleep(self.config.get('report_interval', 30))

    def _work_polling_loop(self):
        logger.info("Work polling thread started")
        while self.running:
            if self.is_connected and self.host_id:
                try:
                    logger.info("Starting new polling cycle.")
                    enabled_models = [model.name for model in self.models.values() if model.enabled]
                    if not enabled_models:
                        logger.info("No enabled models, sleeping...")
                        time.sleep(10)
                        continue
                    
                    logger.info(f"Polling for work with models: {enabled_models}")
                    payload = {"host_id": self.host_id, "models": enabled_models, "timeout": 30}
                    
                    logger.info(f"Sending POST to /api/andy/poll_for_work with payload: {payload}")
                    response = requests.post(f"{self.config['andy_api_url']}/api/andy/poll_for_work", json=payload, timeout=35)
                    
                    logger.info(f"Poll response: {response.status_code}")
                    if response.status_code == 200:
                        result = response.json()
                        if result.get('has_work') and result.get('work_item'):
                            work_data = result['work_item']
                            work_id = work_data.get('work_id')
                            logger.info(f"Received work: {work_id} for model {work_data.get('model')}")
                            threading.Thread(target=self.process_work, args=(work_id, work_data)).start()
                        else:
                            logger.info("No work available")
                    elif response.status_code == 404:
                        logger.warning("Host not registered, marking as disconnected.")
                        self.is_connected = False
                        self.host_id = None
                except requests.exceptions.RequestException as e: 
                    logger.error(f"Polling request exception: {e}", exc_info=True)
                except Exception as e: 
                    logger.error(f"Work polling error: {e}", exc_info=True)
                    time.sleep(5)  # Wait a bit on errors
            else:
                logger.info(f"Not connected or no host_id. Connected: {self.is_connected}, Host ID: {self.host_id}")
                time.sleep(5)

    def process_work(self, work_id: str, work_data: dict):
        logger.info(f"--- Starting to process work {work_id} ---")
        try:
            model = work_data['model']
            if model not in self.models or not self.models[model].enabled:
                logger.error(f"Model {model} not available or not enabled for work {work_id}.")
                self.submit_work_error(work_id, f"Model {model} not available")
                return
            
            work_type = work_data.get('work_type', 'chat')
            start_time = time.time()
            
            logger.info(f"Processing work {work_id} of type '{work_type}' for model '{model}'.")

            if work_type == 'embedding':
                # Handle embedding requests
                ollama_payload = {
                    "model": model, 
                    "prompt": work_data.get('input', ''),
                }
                logger.info(f"Sending embedding request to Ollama for work {work_id}: {ollama_payload}")
                response = requests.post(f"{self.config['ollama_url']}/api/embeddings", json=ollama_payload, timeout=120)
            else:
                # Handle chat requests (default)
                ollama_payload = {
                    "model": model, 
                    "messages": work_data['messages'], 
                    "stream": False,  # Ensure single JSON response
                    **work_data.get('params', {})
                }
                logger.info(f"Sending chat request to Ollama for work {work_id}: {ollama_payload}")
                response = requests.post(f"{self.config['ollama_url']}/api/chat", json=ollama_payload, timeout=120)
            
            response_time = time.time() - start_time
            logger.info(f"Ollama request for work {work_id} completed in {response_time:.2f}s with status {response.status_code}.")

            if response.status_code == 200:
                result = response.json()
                logger.info(f"Ollama response for work {work_id}: {result}")
                self.submit_work_result(work_id, result)
                tokens = result.get('eval_count', 0) if work_type == 'chat' else 0
                self.log_request(model, work_type, tokens, response_time, True)
            else:
                error_msg = f"Ollama request failed: {response.status_code} - {response.text}"
                logger.error(f"Ollama error for work {work_id}: {error_msg}")
                self.submit_work_error(work_id, error_msg)
                self.log_request(model, work_type, 0, response_time, False)
        except Exception as e:
            logger.error(f"Error processing work {work_id}: {e}", exc_info=True)
            self.submit_work_error(work_id, str(e))
        logger.info(f"--- Finished processing work {work_id} ---")

    def submit_work_result(self, work_id: str, result: dict):
        logger.info(f"Submitting result for work {work_id}...")
        try:
            payload = {"work_id": work_id, "result": result}
            response = requests.post(f"{self.config['andy_api_url']}/api/andy/submit_work_result", json=payload, timeout=10)
            if response.status_code == 200:
                logger.info(f"Successfully submitted result for work {work_id}.")
            else:
                logger.error(f"Failed to submit result for work {work_id}. Status: {response.status_code}, Response: {response.text}")
        except Exception as e: 
            logger.error(f"Error submitting work result for {work_id}: {e}", exc_info=True)

    def submit_work_error(self, work_id: str, error: str):
        logger.info(f"Submitting error for work {work_id}: {error}")
        try:
            payload = {"work_id": work_id, "error": error}
            response = requests.post(f"{self.config['andy_api_url']}/api/andy/submit_work_result", json=payload, timeout=10)
            if response.status_code == 200:
                logger.info(f"Successfully submitted error for work {work_id}.")
            else:
                logger.error(f"Failed to submit error for work {work_id}. Status: {response.status_code}, Response: {response.text}")
        except Exception as e: 
            logger.error(f"Error submitting work error for {work_id}: {e}", exc_info=True)

    def log_request(self, model_name: str, request_type: str, tokens: int, response_time: float, success: bool):
        try:
            with sqlite3.connect(DB_FILE) as conn:
                conn.execute("INSERT INTO requests (model_name, request_type, tokens, response_time, success) VALUES (?, ?, ?, ?, ?)", (model_name, request_type, tokens, response_time, success))
            self.stats.total_requests += 1
            if success: self.stats.successful_requests += 1
            else: self.stats.failed_requests += 1
            self.stats.total_tokens += tokens
            self.stats.last_request_time = datetime.now()
        except Exception as e: logger.error(f"Error logging request: {e}")

client = LocalClient()

@app.route('/favicon.ico')
def favicon(): return send_from_directory(os.path.join(app.root_path, 'static'), 'favicon.ico', mimetype='image/vnd.microsoft.icon')

@app.route('/')
def index(): return render_template('index.html', models=client.models, stats=asdict(client.stats), config=client.config, is_connected=client.is_connected, host_id=client.host_id)

@app.route('/models')
def models_page(): return render_template('models.html', models=client.models, config=client.config)

@app.route('/metrics')
def metrics_page():
    uptime_seconds = (datetime.now() - client.stats.uptime_start).total_seconds()
    return render_template('metrics.html', models=client.models, stats=asdict(client.stats), config=client.config, uptime_hours=f"{uptime_seconds / 3600:.1f}")

@app.route('/settings')
def settings_page(): return render_template('settings.html', config=client.config, is_connected=client.is_connected, models=client.models)

@app.route('/api/models/<path:model_name>/toggle', methods=['POST'])
def toggle_model(model_name):
    model_name = unquote(model_name)
    if model_name in client.models:
        client.models[model_name].enabled = not client.models[model_name].enabled
        logger.info(f"Model {model_name} {'enabled' if client.models[model_name].enabled else 'disabled'}")
        return jsonify({'success': True, 'enabled': client.models[model_name].enabled})
    return jsonify({'success': False, 'error': 'Model not found'}), 404

@app.route('/api/models/<path:model_name>/config', methods=['POST'])
def update_model_config(model_name):
    model_name = unquote(model_name)
    if model_name not in client.models: return jsonify({'success': False, 'error': 'Model not found'}), 404
    data = request.get_json()
    model = client.models[model_name]
    for key in ['max_concurrent', 'context_length', 'supports_embedding', 'supports_vision', 'supports_audio']:
        if key in data: setattr(model, key, data[key])
    logger.info(f"Updated config for model {model_name}")
    return jsonify({'success': True})

@app.route('/api/discover_models', methods=['POST'])
def discover_models_endpoint():
    client.discover_models()
    return jsonify({'success': True, 'model_count': len(client.models)})

@app.route('/api/refresh_models', methods=['POST'])
def refresh_models_endpoint():
    client.discover_models()
    return jsonify({'success': True, 'models': len(client.models)})

@app.route('/api/connect', methods=['POST'])
def connect():
    if client.connect_to_pool():
        return jsonify({'success': True, 'host_id': client.host_id})
    return jsonify({'success': False, 'error': 'Failed to connect'}), 500

@app.route('/api/disconnect', methods=['POST'])
def disconnect():
    if client.disconnect_from_pool():
        return jsonify({'success': True})
    return jsonify({'success': False, 'error': 'Failed to disconnect'}), 500

@app.route('/api/save_config', methods=['POST'])
def save_config_endpoint():
    data = request.get_json()
    client.config.update(data)
    client.save_config()
    logger.info("Configuration saved")
    return jsonify({'success': True})

@app.route('/api/status')
def status():
    return jsonify({'is_connected': client.is_connected, 'host_id': client.host_id, 'running': client.running, 'enabled_models': [name for name, model in client.models.items() if model.enabled]})

@app.route('/api/metrics_data')
def api_metrics_data():
    try:
        uptime_seconds = (datetime.now() - client.stats.uptime_start).total_seconds()
        return jsonify({
            'current_stats': {
                'total_requests': client.stats.total_requests, 'successful_requests': client.stats.successful_requests,
                'average_tokens_per_second': client.stats.average_tokens_per_second,
                'enabled_models': sum(1 for model in client.models.values() if model.enabled),
                'connected': client.is_connected, 'uptime': uptime_seconds,
            }
        })
    except Exception as e:
        logger.error(f"Error getting metrics data: {e}")
        return jsonify({'error': 'Failed to retrieve metrics'}), 500

if __name__ == '__main__':
    port = client.config.get('flask_port', 5000)
    # Start background threads, which will handle auto-connect if enabled.
    client.start_background_threads()
    try:
        app.run(host='0.0.0.0', port=port, debug=False)
    finally:
        client.stop_background_threads()
        client.disconnect_from_pool()