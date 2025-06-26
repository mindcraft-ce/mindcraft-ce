#!/usr/bin/env python3
"""
Andy API Host Client - Fixed Version
A simple client script for joining the Andy API compute pool.

This script helps you:
1. Register your host with the Andy API pool
2. Monitor your host's performance
3. Automatically detect available Ollama models
4. Send health pings to maintain pool membership

Usage:
    python andy_host_client.py --name "my-host" --andy-url https://mindcraft.riqvip.dev

Requirements:
    pip install requests
"""

import argparse
import requests
import time
import json
import sys
import logging
import threading
from typing import Dict, List, Optional

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

class AndyHostClient:
    def __init__(self, ollama_url: str, host_name: str, andy_api_url: str, capabilities: Optional[List[str]] = None, allowed_models: Optional[List[str]] = None):
        self.ollama_url = ollama_url.rstrip('/')
        self.host_name = host_name
        self.andy_api_url = andy_api_url.rstrip('/')
        self.capabilities = capabilities or []
        self.allowed_models = allowed_models
        self.host_id = None
        self.registered = False
        self.connection_lock = threading.Lock()
        self._cached_models: Optional[List[Dict]] = None
        self._models_cache_time = 0
        self._models_cache_ttl = 300  # Cache models for 5 minutes

    def get_available_models(self) -> List[Dict]:
        """Detect available models from Ollama and filter them."""
        current_time = time.time()
        if self._cached_models is not None and current_time - self._models_cache_time < self._models_cache_ttl:
            return self._cached_models

        try:
            response = requests.get(f"{self.ollama_url}/api/tags", timeout=10)
            if response.status_code == 200:
                all_models_data = response.json().get('models', [])
                all_available_models = {m['name']: m for m in all_models_data}
                logger.info(f"Detected {len(all_available_models)} models from Ollama.")

                if self.allowed_models:
                    filtered_models_data = [all_available_models[name] for name in self.allowed_models if name in all_available_models]
                    if len(filtered_models_data) != len(self.allowed_models):
                        missing = set(self.allowed_models) - set(all_available_models.keys())
                        logger.warning(f"Some allowed models are not available in Ollama: {list(missing)}")
                    final_models = filtered_models_data
                else:
                    final_models = all_models_data
                
                self._cached_models = final_models
                self._models_cache_time = current_time
                return final_models
            else:
                logger.error(f"Failed to detect models from Ollama: {response.status_code}")
                return []
        except Exception as e:
            logger.error(f"Error detecting models: {e}")
            return []

    def join_pool(self) -> bool:
        models_to_advertise = self.get_available_models()
        if not models_to_advertise:
            logger.warning("No models available to advertise. Cannot join pool.")
            return False

        data = {"info": {'name': self.host_name, 'capabilities': self.capabilities, 'models': models_to_advertise}}
        try:
            response = requests.post(f"{self.andy_api_url}/api/andy/join_pool", json=data, timeout=10)
            if response.status_code == 200:
                result = response.json()
                with self.connection_lock:
                    self.host_id = result.get('host_id')
                    if not self.host_id:
                        logger.error("Server did not return a host_id!")
                        return False
                    self.registered = True
                logger.info(f"Successfully joined pool with host_id: {self.host_id}")
                return True
            else:
                logger.error(f"Failed to join pool: {response.status_code} - {response.text}")
                return False
        except Exception as e:
            logger.error(f"Error joining pool: {e}")
            return False

    def send_ping(self) -> bool:
        with self.connection_lock:
            if not self.registered: return False
            host_id = self.host_id
        
        data = {'host_id': host_id, 'current_load': 0, 'status': 'active'}
        try:
            response = requests.post(f"{self.andy_api_url}/api/andy/ping_pool", json=data, timeout=10)
            if response.status_code == 200:
                logger.debug("Ping sent successfully")
                return True
            elif response.status_code == 404:
                logger.warning("Ping failed with 404 (Host Not Found). Marking as unregistered.")
                with self.connection_lock:
                    if self.host_id == host_id: self.registered = False
                return False
            else:
                logger.warning(f"Ping failed: {response.status_code} - {response.text}")
                return False
        except Exception as e:
            logger.error(f"Error sending ping: {e}")
            return False

    def leave_pool(self) -> bool:
        with self.connection_lock:
            if not self.registered: return True
            data = {'host_id': self.host_id}
        try:
            requests.post(f"{self.andy_api_url}/api/andy/leave_pool", json=data, timeout=10)
            logger.info("Successfully left pool")
        except Exception as e:
            logger.error(f"Error leaving pool: {e}")
        finally:
            with self.connection_lock:
                self.registered = False
        return True

    def run_monitoring_loop(self, ping_interval: int = 15, poll_interval: int = 3):
        logger.info(f"Starting monitoring loop with {ping_interval}s ping and {poll_interval}s work poll interval")
        running = True
        
        def ping_worker():
            while running:
                with self.connection_lock: is_registered = self.registered
                if is_registered: self.send_ping()
                else: self.join_pool()
                time.sleep(ping_interval)

        ping_thread = threading.Thread(target=ping_worker, daemon=True)
        ping_thread.start()

        try:
            while running:
                host_id_for_poll = None
                with self.connection_lock:
                    if self.registered: host_id_for_poll = self.host_id
                
                if not host_id_for_poll:
                    logger.debug("Work poller: waiting for registration...")
                    time.sleep(5)
                    continue

                try:
                    models = self.get_available_models()
                    if not models:
                        time.sleep(10)
                        continue
                    
                    payload = {"host_id": host_id_for_poll, "models": [m['name'] for m in models]}
                    response = requests.post(f"{self.andy_api_url}/api/andy/check_for_work", json=payload, timeout=10)

                    if response.status_code == 200:
                        work_data = response.json()
                        work_id = work_data.get('work_id')
                        if work_id:
                            logger.info(f"Received work: {work_id} for model {work_data.get('model')}")
                            threading.Thread(target=self.process_work, args=(work_id, work_data)).start()
                    elif response.status_code == 204:
                        time.sleep(poll_interval)
                    elif response.status_code == 404:
                        logger.warning("Work poll failed: Host not registered (404). Will re-join.")
                        with self.connection_lock: self.registered = False
                        time.sleep(5)
                    else:
                        logger.warning(f"Work poll failed: {response.status_code}")
                        time.sleep(5)
                except requests.exceptions.RequestException as e:
                    logger.error(f"Work polling network error: {e}")
                    time.sleep(5)
                except Exception as e:
                    logger.error(f"Unexpected error in work poll loop: {e}", exc_info=True)
                    time.sleep(10)
        except KeyboardInterrupt:
            logger.info("Monitoring interrupted by user")
        finally:
            running = False
            self.leave_pool()
            if ping_thread: ping_thread.join(timeout=5)

    def process_work(self, work_id: str, work_data: dict):
        try:
            task_type = work_data.get('task_type', 'chat')
            if task_type == 'embedding': self._process_embedding_work(work_id, work_data)
            elif task_type == 'model_discovery': self._process_model_discovery_work(work_id, work_data)
            else: self._process_chat_work(work_id, work_data)
        except Exception as e:
            logger.error(f"Error processing work {work_id}: {e}")
            self.submit_work_result(work_id, {"error": f"Work processing failed: {str(e)}"})

    def submit_work_result(self, work_id: str, result: dict):
        is_error = 'error' in result
        payload = {"work_id": work_id, "error" if is_error else "result": result.get('error') if is_error else result}
        try:
            response = requests.post(f"{self.andy_api_url}/api/andy/submit_work_result", json=payload, timeout=10)
            if response.status_code == 200:
                logger.info(f"Successfully submitted {'error' if is_error else 'result'} for work {work_id}")
            else:
                logger.error(f"Failed to submit result for work {work_id}: {response.status_code}")
        except Exception as e:
            logger.error(f"Failed to submit result due to network error: {e}")

    def _process_chat_work(self, work_id: str, work_data: dict):
        ollama_payload = {"model": work_data['model'], "messages": work_data['messages'], "stream": False, **work_data.get('params', {})}
        try:
            response = requests.post(f"{self.ollama_url}/api/chat", json=ollama_payload, timeout=120)
            if response.status_code == 200:
                self.submit_work_result(work_id, response.json())
            else:
                self.submit_work_result(work_id, {"error": f"Ollama request failed: {response.status_code}"})
        except Exception as e:
            self.submit_work_result(work_id, {"error": f"Ollama request error: {e}"})

    def _process_embedding_work(self, work_id: str, work_data: dict):
        ollama_payload = {"model": work_data['model'], "prompt": work_data['input']}
        try:
            response = requests.post(f"{self.ollama_url}/api/embeddings", json=ollama_payload, timeout=60)
            if response.status_code == 200 and 'embedding' in response.json():
                self.submit_work_result(work_id, {"embedding": response.json()['embedding']})
            else:
                self.submit_work_result(work_id, {"error": f"Ollama embedding request failed: {response.status_code}"})
        except Exception as e:
            self.submit_work_result(work_id, {"error": f"Ollama embedding error: {e}"})
            
    def _process_model_discovery_work(self, work_id: str, work_data: dict):
        models = self.get_available_models()
        self.submit_work_result(work_id, {"models": models})

def main():
    parser = argparse.ArgumentParser(description='Andy API Host Client')
    parser.add_argument('--url', default='http://localhost:11434', help='Ollama server URL')
    parser.add_argument('--name', required=True, help='Host name for identification')
    parser.add_argument('--andy-url', default='https://mindcraft.riqvip.dev', help='Andy API base URL')
    parser.add_argument('--capabilities', nargs='*', default=[], help='Host capabilities (e.g., vision, code, math)')
    parser.add_argument('--allowed-models', nargs='*', default=None, help='Only advertise these models to the server')
    parser.add_argument('--ping-interval', type=int, default=15, help='Ping interval in seconds')
    
    args = parser.parse_args()
    
    client = AndyHostClient(
        ollama_url=args.url, host_name=args.name, andy_api_url=args.andy_url,
        capabilities=args.capabilities, allowed_models=args.allowed_models
    )
    
    client.run_monitoring_loop(args.ping_interval)

if __name__ == '__main__':
    main()