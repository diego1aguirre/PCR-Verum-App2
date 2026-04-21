FROM node:18-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm install
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY
ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL
ENV VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY
ARG VITE_API_URL
ARG VITE_FLASK_URL
ENV VITE_API_URL=$VITE_API_URL
ENV VITE_FLASK_URL=$VITE_FLASK_URL
COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
