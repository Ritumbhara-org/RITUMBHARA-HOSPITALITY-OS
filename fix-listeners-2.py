import re

with open('lib/whatsapp/listeners.ts', 'r', encoding='utf-8') as f:
    content = f.read()

old_co1 = '''      const messageContent = Hi ,

We hope you enjoyed your stay with us! Just a friendly reminder that checkout is today at 11:00 AM.

To help our cleaning team prepare for the next guest, we would truly appreciate it if you could follow these quick steps before heading out:

Lights & AC: Please turn off all lights and the air conditioning.
Trash: Place any bagged trash in the bin
Dishes: Please leave any used dishes in the sink
Final Check: Double-check for any chargers or personal items!

Please send us a quick message once you have officially checked out so we can give our housekeeping team a head start.

Safe travels, and we hope to see you again soon!

Best,
Ritumbhara Hospitality;'''
new_co1 = '''      const messageContent = Hi 

We hope you enjoyed your stay with us! Just a friendly reminder that checkout is today at 11AM.

To help our cleaning team prepare for the next guest, we would truly appreciate it if you could follow these quick steps before heading out:

Lights & AC: Please turn off all lights and the air conditioning.
Trash: Place any bagged trash in the bin
Dishes: Please leave any used dishes in the sink
Final Check: Double-check for any chargers or personal items!

Please send us a quick message once you have officially checked out so we can give our housekeeping team a head start.

Safe travels, and we hope to see you again soon!

Best, Ritumbhara Hospitality;'''

content = content.replace(old_co1, new_co1)

with open('lib/whatsapp/listeners.ts', 'w', encoding='utf-8') as f:
    f.write(content)
