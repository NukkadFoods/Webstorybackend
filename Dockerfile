# Use Node.js 18 slim as base for smaller image size
FROM node:18-slim

# Install Python 3 and system dependencies
# We install python3-pip and ffmpeg (optional but good for audio processing if needed later)
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy package files first for better caching
COPY package*.json ./

# Install Node.js dependencies
RUN npm install --production

# Copy Python requirements
COPY requirements.txt ./

# Install Python dependencies
# --break-system-packages is needed on newer Debian versions included in node-slim
RUN pip3 install -r requirements.txt --break-system-packages

# Copy the rest of the application code
COPY . .

# Expose the port (Render sets PORT env var, but good to document)
EXPOSE 3001

# Command to run the application
CMD ["node", "server.js"]
