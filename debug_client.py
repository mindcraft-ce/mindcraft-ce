#!/usr/bin/env python3
"""
Simple debug client to test work processing
"""
import requests
import json
import time
import sys

# Configuration
ANDY_API_URL = "https://mindcraft.riqvip.dev"
OLLAMA_URL = "http://localhost:11434"
HOST_ID = "debug-client-001"

def join_pool():
    """Join the compute pool"""
    payload = {
        "host_id": HOST_ID,
        "info": {
            "endpoint": OLLAMA_URL,
            "models": [{"name": "sweaterdog/andy-4:micro-q5_k_m"}],
            "max_clients": 1,
            "capabilities": ["text"]
        }
    }
    
    response = requests.post(f"{ANDY_API_URL}/api/andy/join_pool", json=payload)
    print(f"Join pool: {response.status_code} - {response.text}")
    return response.status_code == 200

def poll_for_work():
    """Poll for work with short timeout"""
    payload = {
        "host_id": HOST_ID,
        "models": [{"name": "sweaterdog/andy-4:micro-q5_k_m"}]
    }
    
    print("Polling for work...")
    response = requests.post(f"{ANDY_API_URL}/api/andy/poll_for_work", json=payload, timeout=5)
    print(f"Poll result: {response.status_code}")
    
    if response.status_code == 200:
        work_data = response.json()
        print(f"Received work: {json.dumps(work_data, indent=2)}")
        return work_data
    else:
        print(f"No work: {response.text}")
        return None

def process_work(work_data):
    """Process the work and submit result"""
    work_id = work_data.get('work_id')
    model = work_data.get('model')
    messages = work_data.get('messages')
    
    print(f"Processing work {work_id} with model {model}")
    print(f"Messages: {json.dumps(messages, indent=2)}")
    
    # Make Ollama request
    ollama_payload = {
        "model": model,
        "messages": messages,
        "stream": False
    }
    
    print(f"Calling Ollama with: {json.dumps(ollama_payload, indent=2)}")
    
    try:
        response = requests.post(f"{OLLAMA_URL}/api/chat", json=ollama_payload, timeout=30)
        print(f"Ollama response: {response.status_code}")
        
        if response.status_code == 200:
            result = response.json()
            print(f"Ollama result: {json.dumps(result, indent=2)}")
            
            # Submit result
            submit_payload = {
                "work_id": work_id,
                "result": result
            }
        else:
            print(f"Ollama error: {response.text}")
            submit_payload = {
                "work_id": work_id,
                "error": f"Ollama error: {response.status_code}"
            }
        
        # Submit to server
        print(f"Submitting result: {json.dumps(submit_payload, indent=2)}")
        submit_response = requests.post(f"{ANDY_API_URL}/api/andy/submit_work_result", json=submit_payload, timeout=10)
        print(f"Submit result: {submit_response.status_code} - {submit_response.text}")
        
    except Exception as e:
        print(f"Error processing work: {e}")
        # Submit error
        submit_payload = {
            "work_id": work_id,
            "error": str(e)
        }
        try:
            submit_response = requests.post(f"{ANDY_API_URL}/api/andy/submit_work_result", json=submit_payload, timeout=10)
            print(f"Submit error result: {submit_response.status_code} - {submit_response.text}")
        except Exception as submit_error:
            print(f"Failed to submit error: {submit_error}")

def main():
    print("=== Debug Client Starting ===")
    
    # Join pool
    if not join_pool():
        print("Failed to join pool")
        sys.exit(1)
    
    # Poll for work once
    work_data = poll_for_work()
    if work_data:
        process_work(work_data)
    else:
        print("No work received")
    
    print("=== Debug Client Finished ===")

if __name__ == "__main__":
    main()
