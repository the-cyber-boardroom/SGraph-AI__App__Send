import warnings

from pydantic.json_schema                                                         import PydanticJsonSchemaWarning
from sgraph_ai_app_send__docker.Fast_API__SGraph__Send__Container                 import Fast_API__SGraph__Send__Container


# Type_Safe primitive types (Safe_Str__Id, etc.) used in FastAPI request models
# carry default values that Pydantic can't JSON-encode. Pydantic still excludes
# them from the JSON Schema correctly — it just emits a warning per field. The
# warnings have no runtime effect; suppressing them keeps container startup quiet.
warnings.filterwarnings('ignore', category=PydanticJsonSchemaWarning)


def create_app():
    with Fast_API__SGraph__Send__Container() as _:
        _.setup()
        return _.app()
