FROM python:3.11-slim

WORKDIR /app

# Copy requirements first for better caching
COPY backend/requirements.txt .

# Install dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Copy the backend application
COPY backend/ .

# Copy config files
COPY config/ ./config/

# Expose the port the app runs on
EXPOSE 5001

# Run the application
CMD ["python", "src/api.py"]
