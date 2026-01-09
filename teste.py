import os
from twilio.rest import Client
from dotenv import load_dotenv

load_dotenv()

client = Client(
    os.environ.get('TWILIO_ACCOUNT_SID'),
    os.environ.get('TWILIO_AUTH_TOKEN')
)

# Substitua pelo seu número de celular
MEU_CELULAR = '+5531997963940'

call = client.calls.create(
    url=f"{os.environ.get('BASE_URL')}/voice",
    to=MEU_CELULAR,
    from_=os.environ.get('TWILIO_NUMBER'),
    record=True
)

print(f"Chamada iniciada! SID: {call.sid}")
print(f"Atenda seu celular e verifique se ouve o disclaimer.")