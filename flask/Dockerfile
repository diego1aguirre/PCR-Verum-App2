FROM python:3.11-slim
RUN apt-get update && apt-get install -y libreoffice && rm -rf /var/lib/apt/lists/*

# Install Microsoft fonts including Aptos
RUN apt-get update && apt-get install -y wget cabextract fontconfig && \
    mkdir -p /usr/share/fonts/truetype/aptos && \
    wget -q https://github.com/microsoft/aptos-font/raw/main/fonts/Aptos.ttf -O /usr/share/fonts/truetype/aptos/Aptos.ttf && \
    wget -q https://github.com/microsoft/aptos-font/raw/main/fonts/Aptos-Bold.ttf -O /usr/share/fonts/truetype/aptos/Aptos-Bold.ttf && \
    wget -q https://github.com/microsoft/aptos-font/raw/main/fonts/Aptos-Italic.ttf -O /usr/share/fonts/truetype/aptos/Aptos-Italic.ttf && \
    wget -q https://github.com/microsoft/aptos-font/raw/main/fonts/Aptos-BoldItalic.ttf -O /usr/share/fonts/truetype/aptos/Aptos-BoldItalic.ttf && \
    fc-cache -fv && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
EXPOSE 5000
CMD ["gunicorn", "--bind", "0.0.0.0:5000", "app:app"]
