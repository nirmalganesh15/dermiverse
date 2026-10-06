# Single-container build for hosted demos (e.g. Render). Builds the React app,
# then serves it together with the Django API through Waitress + WhiteNoise.

FROM node:22-slim AS frontend
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY frontend/ ./
RUN npm run build

FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /app/backend
COPY backend/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY backend/ ./
COPY --from=frontend /app/frontend/dist /app/frontend/dist
COPY deploy/start.sh /app/deploy/start.sh
RUN SECRET_KEY=build python manage.py collectstatic --noinput
CMD ["sh", "/app/deploy/start.sh"]
