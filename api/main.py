# -*- coding: utf-8 -*-

from fastapi import FastAPI
from .routers import mail, ping
from fastapi.middleware.cors import CORSMiddleware

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
origins =
    "chrome-extension://",  # Replace with your actual Chrome extension ID
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
