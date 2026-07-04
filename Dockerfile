# Single image running Node (Next.js) + Python (image post-processing).
# Railway builds this once; the web and worker services share it with
# different start commands (npm run start / npm run worker).
FROM node:20-bookworm-slim

# Python for the image post-processor
RUN apt-get update && apt-get install -y --no-install-recommends \
      python3 python3-pip \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Python deps (Pillow wheels bundle their own libs)
COPY requirements.txt ./
RUN pip3 install --no-cache-dir --break-system-packages -r requirements.txt

# Node deps
COPY package.json package-lock.json ./
RUN npm ci

# App source + build
COPY . .
RUN npm run build

ENV NODE_ENV=production
ENV PYTHON_BIN=python3
EXPOSE 3000

CMD ["npm", "run", "start"]
