from .nodes import NODE_CLASS_MAPPINGS, NODE_DISPLAY_NAME_MAPPINGS

WEB_DIRECTORY = "./web"

try:
    from .routes import register_routes

    register_routes()
except (ImportError, ModuleNotFoundError):
    # Unit tests and documentation tooling may import the package without ComfyUI.
    pass

__all__ = ["NODE_CLASS_MAPPINGS", "NODE_DISPLAY_NAME_MAPPINGS", "WEB_DIRECTORY"]
