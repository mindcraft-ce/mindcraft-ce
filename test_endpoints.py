#!/usr/bin/env python3
"""
Simple test script to trigger requests to the Andy API
"""
import requests
import json
import time

ANDY_API_URL = "https://mindcraft.riqvip.dev"

def test_chat_completion():
    """Test chat completion endpoint"""
    payload = {
        "model": "sweaterdog/andy-4:micro-q5_k_m",
        "messages": [{"role": "user", "content": "Say hello briefly"}],
        "max_tokens": 20
    }
    
    print("Testing chat completion...")
    print(f"Request: {json.dumps(payload, indent=2)}")
    
    try:
        response = requests.post(
            f"{ANDY_API_URL}/api/andy/v1/chat/completions",
            json=payload,
            timeout=30,
            headers={"Content-Type": "application/json"}
        )
        
        print(f"Response status: {response.status_code}")
        print(f"Response: {json.dumps(response.json(), indent=2)}")
        
    except Exception as e:
        print(f"Error: {e}")

def test_embeddings():
    """Test embeddings endpoint"""
    payload = {
        "model": "nomic-embed-text",
        "input": "Hello world"
    }
    
    print("Testing embeddings...")
    print(f"Request: {json.dumps(payload, indent=2)}")
    
    try:
        response = requests.post(
            f"{ANDY_API_URL}/api/andy/v1/embeddings",
            json=payload,
            timeout=30,
            headers={"Content-Type": "application/json"}
        )
        
        print(f"Response status: {response.status_code}")
        result = response.json()
        if "data" in result and len(result["data"]) > 0:
            # Just show the first few embedding values to avoid spam
            embedding = result["data"][0]["embedding"]
            print(f"Embedding length: {len(embedding)}")
            print(f"First 5 values: {embedding[:5]}")
        else:
            print(f"Response: {json.dumps(result, indent=2)}")
        
    except Exception as e:
        print(f"Error: {e}")

def test_model_discovery():
    """Test model discovery endpoint"""
    print("Testing model discovery...")
    
    try:
        response = requests.post(
            f"{ANDY_API_URL}/api/andy/admin/model_discovery",
            timeout=30,
            headers={"Content-Type": "application/json"}
        )
        
        print(f"Response status: {response.status_code}")
        print(f"Response: {json.dumps(response.json(), indent=2)}")
        
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    print("=== Testing Andy API Endpoints ===")
    print(f"Server: {ANDY_API_URL}")
    print()
    
    test_chat_completion()
    print("\n" + "="*50 + "\n")
    
    test_embeddings()
    print("\n" + "="*50 + "\n")
    
    test_model_discovery()
    print("\n=== Tests Complete ===")
