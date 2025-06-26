#!/usr/bin/env python3
"""
Andy API Local Client Launcher
Choose between web interface or command-line client
"""

import sys
import os
import subprocess
import argparse

def main():
    parser = argparse.ArgumentParser(description="Andy API Local Client Launcher")
    parser.add_argument("--mode", choices=["web", "cli", "enhanced"], default="web",
                       help="Launch mode: web interface, CLI client, or enhanced CLI client")
    parser.add_argument("--server", default="https://mindcraft.riqvip.dev",
                       help="Andy API server URL")
    parser.add_argument("--ollama", default="http://localhost:11434",
                       help="Ollama server URL")
    parser.add_argument("--port", type=int, default=5000,
                       help="Port for web interface (web mode only)")
    
    args = parser.parse_args()
    
    if args.mode == "web":
        print("🌐 Starting Andy API Local Client Web Interface...")
        print(f"   Web interface will be available at: http://localhost:{args.port}")
        print(f"   Andy API server: {args.server}")
        print(f"   Ollama server: {args.ollama}")
        print()
        
        # Set environment variables for the web app
        os.environ["ANDY_API_URL"] = args.server
        os.environ["OLLAMA_URL"] = args.ollama
        os.environ["FLASK_PORT"] = str(args.port)
        
        # Launch the Flask web application
        subprocess.run([sys.executable, "app.py"])
        
    elif args.mode == "cli":
        print("💻 Starting Andy API Host Client (CLI)...")
        print(f"   Andy API server: {args.server}")
        print(f"   Ollama server: {args.ollama}")
        print()
        
        # Launch the original CLI client
        subprocess.run([sys.executable, "andy_host_client.py", 
                       "--andy-url", args.server,
                       "--url", args.ollama])
        
    elif args.mode == "enhanced":
        print("🚀 Starting Enhanced Andy API Client (CLI)...")
        print(f"   Andy API server: {args.server}")
        print(f"   Ollama server: {args.ollama}")
        print()
        
        # Launch the enhanced CLI client
        subprocess.run([sys.executable, "enhanced_andy_client.py",
                       "--server", args.server,
                       "--ollama", args.ollama])
    
    else:
        print(f"Unknown mode: {args.mode}")
        sys.exit(1)

if __name__ == "__main__":
    main()
