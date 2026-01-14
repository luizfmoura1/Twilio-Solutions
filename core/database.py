import logging
from flask_sqlalchemy import SQLAlchemy

logger = logging.getLogger(__name__)

db = SQLAlchemy()


def init_db(app):
    """Initialize database with Flask app"""
    db.init_app(app)

    try:
        with app.app_context():
            db.create_all()
            logger.info("Database initialized successfully")
            print("[DATABASE] Initialized successfully")
    except Exception as e:
        logger.error(f"Database initialization error: {e}")
        print(f"[DATABASE ERROR] {e}")
        # Don't crash - app can still serve health checks
