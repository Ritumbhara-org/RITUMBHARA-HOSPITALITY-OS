import re

with open('lib/whatsapp/listeners.ts', 'r', encoding='utf-8') as f:
    content = f.read()

# Fix UPCOMING_CHECK_IN messageContent
old_str_1 = '''Location:
Address: Ritumbhara Property
Map: https://maps.app.goo.gl

Wifi:
Network: Ritumbhara_Guest
Password: Ritumbhara@123'''

new_str_1 = '''Location:
Address: 
Map: 

Wifi:
Network: 
Password: '''

content = content.replace(old_str_1, new_str_1)

# Fix TODAY_CHECK_IN messageContent
old_str_2 = '''Address: Ritumbhara Property\\nMap: https://maps.app.goo.gl\\n\\nWifi:\\nNetwork: Ritumbhara_Guest\\nPassword: Ritumbhara@123'''
new_str_2 = '''Address: \\nMap: \\n\\nWifi:\\nNetwork: \\nPassword: '''

content = content.replace(old_str_2, new_str_2)

# Fix sendWhatsAppMessage parameters (unit?.unit.property -> unit?.property)
content = content.replace('unit?.unit.property?.googleMapsUrl', 'unit?.property?.googleMapsUrl')
content = content.replace('unit?.unit.property?.address', 'unit?.property?.address')
content = content.replace('unit?.unit?.property?.googleMapsUrl', 'unit?.property?.googleMapsUrl')
content = content.replace('unit?.unit?.property?.address', 'unit?.property?.address')
content = content.replace('unit?.unit?.property?.wifiNetwork', 'unit?.property?.wifiNetwork')
content = content.replace('unit?.unit?.property?.wifiPassword', 'unit?.property?.wifiPassword')

with open('lib/whatsapp/listeners.ts', 'w', encoding='utf-8') as f:
    f.write(content)
