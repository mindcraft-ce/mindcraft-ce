# Use a specific Node.js LTS version for better reproducibility
FROM node:20-bookworm-slim

# Set environment variables
ENV DEBIAN_FRONTEND=noninteractive

# Install system dependencies required for headless browser/graphics rendering
# Consolidate into a single RUN command to reduce image layers
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    # Utilities
    git \
    unzip \
    python3 \
    python3-pip \
    tmux \
    # For xvfb and headless rendering
    xvfb \
    xauth \
    # Graphics libraries for WebGL/OpenGL
    libgl1-mesa-dev \
    libgles2-mesa-dev \
    libosmesa6-dev \
    # Other graphics-related libraries
    build-essential \
    libcairo2-dev \
    libpango1.0-dev \
    libjpeg-dev \
    libgif-dev \
    librsvg2-dev \
    libxi-dev \
    libxinerama-dev \
    libxrandr-dev \
    # Install python dependencies if needed
    && python3 -m pip install --no-cache-dir --break-system-packages boto3 tqdm \
    # Clean up apt caches to reduce image size
    && rm -rf /var/lib/apt/lists/*

# Set up the application directory
WORKDIR /app

# Copy package.json and package-lock.json first to leverage Docker cache
COPY package*.json ./

# Install Node.js dependencies
RUN npm install

# Copy the rest of the application code
COPY . .

# Expose the port your application runs on
EXPOSE 8000

# Start the application with xvfb
# Using a specific server number can be more reliable
#CMD ["xvfb-run", "--auto-servernum", "--server-args=-screen 0 1024x768x24", "--error-file=/tmp/xvfb-error.log", "node", "main.js"]
CMD ["/app/start.sh"]