# -*- coding: utf-8 -*-
import os
import pathlib
from dotenv import load_dotenv
from fastapi import FastAPI
from .routers import mail, ping
from fastapi.middleware.cors import CORSMiddleware


BASE_DIR = pathlib.Path(__file__).resolve().parent.parent
if (BASE_DIR / ".env").is_file():
    load_dotenv()
else:
    print("No .env file found")

ID_CHROME_EXT = os.getenv("ID_CHROME_EXT")

description = """Hackathon demo API"""

summary = """Hackathon demo API"""
app = FastAPI(
        title="Hackathon 2025",
        description=description,
        summary=summary,
        version="0.0.1",
        terms_of_service="https://infomaniak.com/ai/terms/",
        contact={
            "name": "Infomaniak",
            "url":  "https://infomaniak.com",
            },
        )

# CORS configuration
origins = [
    f"chrome-extension://{ID_CHROME_EXT}",  # Replace with your actual Chrome extension ID
    "http://127.0.0.1",  # Allow localhost if needed
    "http://localhost:8000",  # Add other origins if needed
]


app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,  # List of allowed origins
    allow_credentials=True,  # Allow cookies to be sent
    allow_methods=["*"],  # Allow all HTTP methods (GET, POST, etc.)
    allow_headers=["*"],  # Allow all headers
)

app.include_router(ping.router)
app.include_router(mail.router)
