# -*- coding: utf-8 -*-

import typer

app = typer.Typer()


@app.command()
def fastapi():
    """Run FastAPI server."""
    import uvicorn

    uvicorn.run(
        "api.main:app",
        host="127.0.0.1",
        port=8000,
        log_level="debug",
        log_config="./logging.yaml",
        reload_dirs=["./api", "./common"],  # Add all relevant dirs
        reload=True,
    )


if __name__ == "__main__":
    app()
