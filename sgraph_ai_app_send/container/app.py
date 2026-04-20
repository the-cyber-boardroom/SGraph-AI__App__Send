from sgraph_ai_app_send.container.Fast_API__SGraph__Send__Container import Fast_API__SGraph__Send__Container


def create_app():
    with Fast_API__SGraph__Send__Container() as _:
        _.setup()
        return _.app()
