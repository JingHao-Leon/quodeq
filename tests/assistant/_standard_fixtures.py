"""A drafted standard that passes the create_standard gate, shared by the
draft_action test modules."""

_VALID_STANDARD = {
    "id": "api-errors", "name": "API Error Contract", "description": "d",
    "weight": 1.0, "source": "assistant",
    "principles": [{"name": "P1", "description": "", "requirements": [
        {"id": "r1", "text": "Endpoints return RFC7807", "description": "", "refs": []},
        {"id": "r2", "text": "Error responses set the problem+json content type", "description": "", "refs": []},
        {"id": "r3", "text": "Validation errors list each invalid field", "description": "", "refs": []},
    ]}],
}
