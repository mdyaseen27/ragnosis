"""Environment-based configuration. Secrets come from the environment only."""
import os


class Config:
    ENV_NAME = "base"
    SECRET_KEY = os.environ.get("SECRET_KEY", "dev-only-insecure-key-change-me")
    MONGO_URI = os.environ.get("MONGO_URI", "")
    MONGO_DB = os.environ.get("MONGO_DB", "ragnosis")
    JWT_ACCESS_MINUTES = int(os.environ.get("JWT_ACCESS_MINUTES", "30"))
    JWT_REFRESH_DAYS = int(os.environ.get("JWT_REFRESH_DAYS", "7"))
    BCRYPT_ROUNDS = int(os.environ.get("BCRYPT_ROUNDS", "12"))
    CORS_ORIGINS = [
        o.strip()
        for o in os.environ.get("CORS_ORIGINS", "http://localhost:5173").split(",")
        if o.strip()
    ]
    GROQ_API_KEY = os.environ.get("GROQ_API_KEY", "")
    UPLOAD_DIR = os.environ.get("UPLOAD_DIR", "uploads")
    MAX_UPLOAD_MB = int(os.environ.get("MAX_UPLOAD_MB", "15"))
    LOG_LEVEL = os.environ.get("LOG_LEVEL", "INFO")
    RATELIMIT_DEFAULT = os.environ.get("RATELIMIT_DEFAULT", "300 per minute")


class DevelopmentConfig(Config):
    ENV_NAME = "development"


class ProductionConfig(Config):
    ENV_NAME = "production"


class TestingConfig(Config):
    ENV_NAME = "testing"
    TESTING = True


def get_config():
    return {
        "production": ProductionConfig,
        "testing": TestingConfig,
    }.get(os.environ.get("APP_ENV", "development"), DevelopmentConfig)
