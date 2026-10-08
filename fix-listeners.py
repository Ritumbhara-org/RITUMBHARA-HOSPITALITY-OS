import re

with open('lib/whatsapp/listeners.ts', 'r', encoding='utf-8') as f:
    content = f.read()

# Fix BOOKING_CREATED
old_bc = '''      const messageContent = Hi ,

Thanks for booking ! We are thrilled to host you and aim to deliver a seamless 5-star experience.

Quick Details:

Check-in: After 1PM  
Check-out: Before 11AM  

Directions the Studio :  

Address: 

Action Required: To ensure an uninterrupted check-in, please fill out our Guest Form here: https://forms.gle/NnCHqpCz1aj6c9T26

Manage Your Stay:
Access your directions, Wi-Fi password, AI support, and housekeeping requests at your personalized Guest Portal:
/stay/

If you have any questions or need recommendations, just send us a message. We're here to help!

Best, Ritumbhara Hospitality;'''
new_bc = '''      const messageContent = Hi ,

Thanks for booking ! We are thrilled to host you and aim to deliver a seamless 5-star experience.

Quick Details:
Check-in: After 1PM 
Check-out: Before 11AM 

Directions to the Studio : 
Address: 

Action Required: To ensure an uninterrupted check-in, please fill out our Guest Form here: https://forms.gle/NnCHqpCz1aj6c9T26

Manage Your Stay:
Access your directions, Wi-Fi password, AI support, and housekeeping requests at your personalized Guest Portal: /stay/

If you have any questions or need recommendations, just send us a message. We're here to help!

Best, Ritumbhara Hospitality;'''
content = content.replace(old_bc, new_bc)

# Fix UPCOMING_CHECK_IN messageContent
old_pa1 = '''      const messageContent = Hi ,

Your stay at  is coming up! Check-in: anytime after 1PM on .

Location:
Address: 
Map: 

Wifi:
Network: 
Password: 

Action Required: Please share photos of IDs for all guests in this chat. This is required by local regulations to complete your registration.

Manage Your Stay:
Access your personalized Guest Portal here: /stay/

Good to know:
Housekeeping: Complimentary, available in designated time slot on request.

Friendly House Rules:
- Quiet Hours: 10PM - 8AM
- Smoking: Strictly NO smoking indoors
- Energy: Please turn off AC/lights when leaving
- Visitors: Only registered guests allowed overnight
- Delivery: For safety, delivery persons are not allowed inside. Please self-pick up orders from the Gate.

Support: If you need anything, message us or use the call button!

Best, Ritumbhara Hospitality;'''
new_pa1 = '''      const messageContent = Hi ,

Your stay at  is coming up! Check-in: anytime after 1PM on .

Wifi:
Network: 
Password: 

Action Required: Please share photos of IDs for all guests in this chat. This is required by local regulations to complete your registration.

Good to know:
Housekeeping: Complimentary, available in designated time slot on request.

Friendly House Rules:
Quiet Hours: 10PM - 8AM
Smoking: Strictly NO smoking indoors
Energy: Please turn off AC/lights when leaving
Visitors: Only registered guests allowed overnight
Delivery: For safety, delivery persons are not allowed inside. Please self-pick up orders from the Gate.

Support: If you need anything, message us or use the call button!

Best, Ritumbhara Hospitality;'''
content = content.replace(old_pa1, new_pa1)

# Fix TODAY_CHECK_IN messageContent
old_pa2 = '''      const messageContent = Hi ,\\n\\nYour stay at  is today! Check-in: anytime after 1PM.\\n\\nLocation:\\nAddress: \\nMap: \\n\\nWifi:\\nNetwork: \\nPassword: \\n\\nAction Required: Please share photos of IDs for all guests in this chat.\\n\\nManage Your Stay:\\n/stay/;'''
new_pa2 = '''      const messageContent = Hi ,\\n\\nYour stay at  is coming up! Check-in: anytime after 1PM on .\\n\\nWifi:\\nNetwork: \\nPassword: \\n\\nAction Required: Please share photos of IDs for all guests in this chat. This is required by local regulations to complete your registration.\\n\\nGood to know:\\nHousekeeping: Complimentary, available in designated time slot on request.\\n\\nFriendly House Rules:\\nQuiet Hours: 10PM - 8AM\\nSmoking: Strictly NO smoking indoors\\nEnergy: Please turn off AC/lights when leaving\\nVisitors: Only registered guests allowed overnight\\nDelivery: For safety, delivery persons are not allowed inside. Please self-pick up orders from the Gate.\\n\\nSupport: If you need anything, message us or use the call button!\\n\\nBest, Ritumbhara Hospitality;'''
content = content.replace(old_pa2, new_pa2)

with open('lib/whatsapp/listeners.ts', 'w', encoding='utf-8') as f:
    f.write(content)
