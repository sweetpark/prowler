FROM python:3.12-slim

WORKDIR /app

# Prowler 의존성 설치
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc git curl && rm -rf /var/lib/apt/lists/*

# Python 패키지 설치
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt && \
    pip install --no-cache-dir prowler

COPY . .

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
