FROM python:3.11-slim
RUN apt-get update && apt-get install -y libreoffice && rm -rf /var/lib/apt/lists/*

# Install Microsoft core fonts (Arial, Times New Roman, Verdana) directly
# ttf-mscorefonts-installer is not available on Debian trixie
RUN apt-get update && apt-get install -y fontconfig wget cabextract && \
    wget -q https://raw.githubusercontent.com/Winetricks/winetricks/master/src/winetricks && \
    chmod +x winetricks && \
    mkdir -p /usr/share/fonts/truetype/msfonts && \
    wget -q "https://downloads.sourceforge.net/corefonts/arial32.exe" && \
    cabextract -d /usr/share/fonts/truetype/msfonts arial32.exe && \
    wget -q "https://downloads.sourceforge.net/corefonts/times32.exe" && \
    cabextract -d /usr/share/fonts/truetype/msfonts times32.exe && \
    wget -q "https://downloads.sourceforge.net/corefonts/verdan32.exe" && \
    cabextract -d /usr/share/fonts/truetype/msfonts verdan32.exe && \
    fc-cache -fv && \
    rm -rf /var/lib/apt/lists/* arial32.exe times32.exe verdan32.exe winetricks

# Install Aptos font (Microsoft 365 default) from the official repo
RUN mkdir -p /usr/share/fonts/truetype/aptos && \
    wget -q https://github.com/microsoft/aptos-font/raw/main/fonts/Aptos.ttf -O /usr/share/fonts/truetype/aptos/Aptos.ttf && \
    wget -q https://github.com/microsoft/aptos-font/raw/main/fonts/Aptos-Bold.ttf -O /usr/share/fonts/truetype/aptos/Aptos-Bold.ttf && \
    wget -q https://github.com/microsoft/aptos-font/raw/main/fonts/Aptos-Italic.ttf -O /usr/share/fonts/truetype/aptos/Aptos-Italic.ttf && \
    wget -q https://github.com/microsoft/aptos-font/raw/main/fonts/Aptos-BoldItalic.ttf -O /usr/share/fonts/truetype/aptos/Aptos-BoldItalic.ttf && \
    fc-cache -fv

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
EXPOSE 5000
CMD ["gunicorn", "--bind", "0.0.0.0:5000", "app:app"]
