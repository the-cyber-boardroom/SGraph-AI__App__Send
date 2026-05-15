from osbot_utils.type_safe.Type_Safe import Type_Safe


class Schema__Fast_API__TLS__Config(Type_Safe):     # TLS launch configuration — populated from FAST_API__TLS__* env vars
    enabled   : bool = False                        # Master switch (FAST_API__TLS__ENABLED). Default off.
    cert_file : str  = '/certs/cert.pem'            # Cert file path  (FAST_API__TLS__CERT_FILE)
    key_file  : str  = '/certs/key.pem'             # Key  file path  (FAST_API__TLS__KEY_FILE)
    tls_port  : int  = 443                          # Bind port when TLS is on (FAST_API__TLS__PORT)
