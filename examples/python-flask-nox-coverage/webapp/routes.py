from flask import Blueprint, jsonify

bp = Blueprint("api", __name__)


@bp.get("/status")
def status():
    return jsonify(ok=True)
