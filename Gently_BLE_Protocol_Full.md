Gently
P308 - 2101 Rev 0.2 - Gently Bracelet Secure Bluetooth Communication Protocol
P308 - 2101 Rev 0.2 - Gently Bracelet Secure Bluetooth Communication Protocol

Table of Content
Revision History 3
Introduction 4
Scope: 4
Audience and Confidentiality: 4
Encryption Algorithm 5
Overview: 5
Encryption Keys: 7
Secure Bluetooth Connection 8
Bluetooth Advertisement Packet 9
Gatt Server Setup on Bracelet 11
BLE Generic Packet Formats 12
Command List 12
Get Uptime (Command 0x01) 14
Creation of new Dynamic Key 15
Get Device Info (Command 0x02) 15
Get Event (Command 0x03) 16
Add Event (Command 0x04) 19
Set Event ON/OFF (Command 0x05) 20
Get All Events (Command 0x06) 21
Remove Event (Command 0x07) 22
Remove All Events (Command 0x08) 23
Get Number of Events (Command 0x09) 23
Get Time (Command 0x0A) 24
Set Time (Command 0x0B) 25
Get Device Status (Command 0x0C) 26
Acknowledge Event (Command 0x0D) 27
Set Bracelet Key (Command 0x0E) 27
Get Bracelet Key (Command 0x0F) 28
Find Me (Command 0x10) 29
Enter DFU Mode (Command 0x11) 29
Battery Status Notify (Command 0x80) 31
Active Event Notify (Command 0x81) 31
Time Notify (Command 0x82) 32

CONFIDENTIALITY: The information in this document is confidential and exclusive to Motsai and  
Gently. It shall not be reproduced, disclosed or used without written authorization from Motsai or Gently. Page 2 of 32

            P308 - 2101 Rev 0.2 - Gently Bracelet Secure Bluetooth Communication Protocol

Revision History
Revision Author Date Description
Rev 0.1 Omid Sarbishei 07/10/2025 - First release
Rev 0.2 Omid Sarbishei 07/11/2025 - Added encryption for advertisement
payload using the static factory key

- Refactored advertisement packet
- API version set to 0x01 for 1st release

CONFIDENTIALITY: The information in this document is confidential and exclusive to Motsai and  
Gently. It shall not be reproduced, disclosed or used without written authorization from Motsai or Gently. Page 3 of 32

            P308 - 2101 Rev 0.2 - Gently Bracelet Secure Bluetooth Communication Protocol

Introduction
Scope:
This document presents a detailed description of the Bluetooth communication protocol required to interact
with the Gently Bracelet using a BLE host device, e.g., Android or iOS mobile device.
Audience and Confidentiality:
This document is intended for exclusive use by Motsai and Gently teams and is confidential.

CONFIDENTIALITY: The information in this document is confidential and exclusive to Motsai and  
Gently. It shall not be reproduced, disclosed or used without written authorization from Motsai or Gently. Page 4 of 32

            P308 - 2101 Rev 0.2 - Gently Bracelet Secure Bluetooth Communication Protocol

Encryption Algorithm
Overview:
For security reasons, the BLE characteristic payloads (messages) exchanged between the Bracelet and the
mobile/host application are encrypted using a lightweight algorithm called Tiny Encryption Algorithm (TEA),
which is suitable for embedded systems and it provides a decent level of security. The BLE advertisement
packet is not encrypted as it involves non-sensitive information.

The TEA algorithm uses a 16-byte private key. It works on chunks of 8-byte payloads, and thus all messages
shall be aligned in size as 8, 16, 24 or 32 bytes long, etc. If a message is not 8-bytes aligned, it shall be
padded with 0x00 fields to reach the correct size.

A Python class for encryption and decryption of an 8-byte payload using TEA is shown here:

Python
import math
import sys
import struct
from ctypes import \*
from copy import copy

class Tea:
def **init**(self, key):
if len(key) != 16:
raise ValueError("Key must be a 16-byte array)")
self.key = copy(key)

    def bytes_to_uint32(self, byte_array):
        # Calculate the number of uint32 values
        num_uint32_values = len(byte_array) // 4

        # Use struct.unpack to interpret the byte array as little-endian uint32 values
        uint32_array = struct.unpack('<{}I'.format(num_uint32_values), byte_array)

        return uint32_array

    def uint32o_bytes(self, uint32_array):
        # Pack the uint32 values into a byte array using little-endian format
        byte_array = b''
        for value in uint32_array:
            byte_array += struct.pack('<I', value)

        return byte_array

    def encrypt(self, data):
        """
        Encrypt a 64-bit block (8 bytes) using TEA with a 128-bit key.
        :param data: Byte array of size 8
        :return: Encrypted 8-byte output
        """

CONFIDENTIALITY: The information in this document is confidential and exclusive to Motsai and  
Gently. It shall not be reproduced, disclosed or used without written authorization from Motsai or Gently. Page 5 of 32

            P308 - 2101 Rev 0.2 - Gently Bracelet Secure Bluetooth Communication Protocol

        if len(data) != 8:
            raise ValueError("Input data must be 8 bytes")

        v = self.bytes_to_uint32(data)
        k = self.bytes_to_uint32(self.key)
        y = c_uint32(v[0])
        z = c_uint32(v[1])
        sum = c_uint32(0)
        delta = 0x9e3779b9
        n = 32
        w = [0,0]

        while(n>0):
            sum.value += delta
            y.value += ( z.value << 4 ) + k[0] ^ z.value + sum.value ^ ( z.value >> 5 ) + k[1]
            z.value += ( y.value << 4 ) + k[2] ^ y.value + sum.value ^ ( y.value >> 5 ) + k[3]
            n -= 1

        w[0] = y.value
        w[1] = z.value
        return self.uint32o_bytes(w)

    def decrypt(self, data):
        """
        Decrypt a 64-bit block (8 bytes) using TEA with a 128-bit key.
        :param data: Byte array of size 8
        :return: Decrypted 8-byte output
        """
        if len(data) != 8:
            raise ValueError("Input data must be 8 bytes")

        v = self.bytes_to_uint32(data)
        k = self.bytes_to_uint32(self.key)
        y = c_uint32(v[0])
        z = c_uint32(v[1])
        sum = c_uint32(0xc6ef3720)
        delta = 0x9e3779b9
        n = 32
        w = [0,0]

        while(n>0):
            z.value -= ( y.value << 4 ) + k[2] ^ y.value + sum.value ^ ( y.value >> 5 ) + k[3]
            y.value -= ( z.value << 4 ) + k[0] ^ z.value + sum.value ^ ( z.value >> 5 ) + k[1]
            sum.value -= delta
            n -= 1

        w[0] = y.value
        w[1] = z.value
        return self.uint32o_bytes(w)

Throughout the rest of this document we assume that all integer values are in little endian format (least
significant byte first). For instance a 32-bit unsigned integer will be represented by a 4-byte array value[0:3],
where value[0] will be the LSB and value[3] will be the MSB.

CONFIDENTIALITY: The information in this document is confidential and exclusive to Motsai and  
Gently. It shall not be reproduced, disclosed or used without written authorization from Motsai or Gently. Page 6 of 32

            P308 - 2101 Rev 0.2 - Gently Bracelet Secure Bluetooth Communication Protocol

The 16-byte private key is constructed differently depending on the mode of operation, which are explained
throughout the rest of this document.
Encryption Keys:
Two separate encryption keys might be used by the Bracelet depending on the mode of operation. Each key
shall be 16-bytes long. The keys are described in the table below.

Key Name Key generation Features Key Value
Bracelet Key Unique bracelet key set by Provides basic 0x43EA5F35659859874
(Static) the mobile app after initial encryption to initiate A6F184742C32B2B
Uint8[0:15] pairing. By default in the procedure to create (default in factory mode)
factory mode, the Bracelet the Dynamic Key  
key is a common static Shall be changed by app
key. Bracelet Key shall be after initial pairing
stored in the  
permanent memory of
the Bracelet as well as
the mobile app.
Dynamic Key This key is derived from Upon establishing a Varies
Uint8[0:15] the Bracelet key, the new BLE connection  
unique ID of the Bracelet, session with a
and the Bracelet’s current Bracelet, the Dynamic
uptime when a new BLE Key is re-generated.
connection is established  
by the mobile app. After producing the
Dynamic Key, it is used
The Dynamic Key is to encrypt all the
generated through a messages exchanged
series of messages between the Bracelet
exchanged between the and the mobile app for
Bracelet and the Mobile as long as the BLE
App, where those session remains active
messages are all (the mobile app
encrypted using the remains connected to
Bracelet Key. the bracelet)

The Dynamic Key
provides security
against the replay
attack.

CONFIDENTIALITY: The information in this document is confidential and exclusive to Motsai and  
Gently. It shall not be reproduced, disclosed or used without written authorization from Motsai or Gently. Page 7 of 32

            P308 - 2101 Rev 0.2 - Gently Bracelet Secure Bluetooth Communication Protocol

Secure Bluetooth Connection
The Bluetooth connection involves a host/central role (mobile app) as well as a peripheral role (Bracelet). The
central will scan and find the particular peripheral of interest with the matching ID/serial number available within
the BLE advertisement packet and then it shall initiate the BLE connection with the peripheral and establish a
new Dynamic Key. The connection sequence is shown in Figure 1:

Figure 1: Secure BLE connection sequence between the Host Mobile App (Central) and the Bracelet
(Peripheral) involving the creation of a Dynamic Key to encrypt commands/responses.

CONFIDENTIALITY: The information in this document is confidential and exclusive to Motsai and  
Gently. It shall not be reproduced, disclosed or used without written authorization from Motsai or Gently. Page 8 of 32

            P308 - 2101 Rev 0.2 - Gently Bracelet Secure Bluetooth Communication Protocol

Bluetooth Advertisement Packet
The Bracelet BLE Advertising packet comes with three main AD Types as follows:

AD Type Value
0x01 (Flags) 0x06
0x09 (Complete Local Name) 0x47656E746C79 (“Gently”)
0xFF(Manufacturer-Specific Data) 0x0274 (Motsai Research) + {24-byte payload}

The manufacturer specific data starts by a 2-byte company ID set to 0x0274 for Motsai Research. This
is then followed by a 24-byte payload, which shall be encrypted using the static 16-byte default Factory
Key: 0x43EA5F35659859874A6F184742C32B2B

The 24-byte manufacturer specific payload prior to encryption is as follows:

24-byte manufacturer specific payload following the company ID 0x0274 (Motsai Research)
Byte#0 Byte#1-2 Byte#3-4 Byte#5-12
API Version Packet Counter Error Code Unique ID /  
Uint8 (0x01) Uint16 Uint16 Serial Number
0x0000-0xFFFF Uint8[0:7]
Increments on each
update

Byte#13 Byte#14 Byte#15
Local time hour Local time minute Local time seconds
Uint8 in BCD format Uint8 in BCD format Uint8 in BCD format
(0x00-0x23) (0x00-0x59) (0x00-0x59)

Byte#16 Byte#17 Byte#18
Year Month Date
Uint8 in BCD format Uint8 in BCD format (0x01-0x12) Uint8 in BCD format (0x01-0x31)
(0x00-0x99) (2000-2099) Example: 0x03 - March Example: 0x30 (30th)

Byte#19 Byte#20-21
Week day Battery Reading Raw Voltage (mV)
Uint8 (0-6) Uint16
Sunday (0x00)

CONFIDENTIALITY: The information in this document is confidential and exclusive to Motsai and  
Gently. It shall not be reproduced, disclosed or used without written authorization from Motsai or Gently. Page 9 of 32

            P308 - 2101 Rev 0.2 - Gently Bracelet Secure Bluetooth Communication Protocol

Monday (0x01)
Tuesday (0x02)
Wednesday (0x03)
Thursday (0x04)
Friday (0x05)
Saturday (0x06)

Byte#22
Bit#0-1 Bit#2 Bit#3-5 Bit#6 Bits#7
(right-most)
RESERVED (0) Charging Battery Level Bracelet Key Any Event Active
(ON: 1) (Estimate) Type 0 (No)
(OFF: 0) 0’b000 (CRITICAL) 0 (Factory) 1 (Yes)
0’b001 (LOW) 1 (Modified)
0’b010 (MEDIUM)
0’b011 (GOOD)
0’b100 (FULL)

Byte#23
RESERVED (0 Padded)
NOTE: In this document, it is assumed that all “RESERVED” or “0 Padded” bytes shall be set to 0x00

The API version for the first release of the protocol is considered to be 0x01.

An example serial number (unique ID) is 0x1234567890ABCDEF.

The 16-bit error code (Byte#3-4) is a bitmask of different errors on the Bracelet as elaborated in the
table below:

Bracelet 16-bit Error Code Bitmask
Bit Position Error Description
Bit#0 (leftmost bit Byte#9) Bluetooth Core Error
Bit#1 (Byte#9) Battery Capture Error
Bit#2 (Byte#9) Vibration Motor Driver Error
Bit#3 (Byte#9) Buzzer Error
Bit#4 (Byte#9) Permanent Memory Error
Bit#5 (Byte#9) Input/Output pin error

CONFIDENTIALITY: The information in this document is confidential and exclusive to Motsai and  
Gently. It shall not be reproduced, disclosed or used without written authorization from Motsai or Gently. Page 10 of 32

            P308 - 2101 Rev 0.2 - Gently Bracelet Secure Bluetooth Communication Protocol

Bit#6 (Byte#9) User Button Error
Bit#7 (rightmost bit Byte#9) LED Strip Error
Bit#8 (leftmost bit Byte#10 Watchdog Timer Error
Bit#9 (Byte#10) Real-time clock (RTC) error
Bit#9-15 (Byte#10) RESERVED

The 16-bit error code shall always be 0 in normal operation.

Byte#13-19: These fields represent the current date and local time in hours, minutes and seconds on
the bracelet. They are updated once every 10 seconds during BLE advertisement.

NOTE: If the mobile application determines that the current date and time differ from the actual
date/time (by say more than 1 minute), then it shall establish a BLE connection with the Bracelet and
send a command to it to set the correct date and local time on the Bracelet.

Byte#20-21: This shows the raw battery voltage reading in mV as a UInt16 value in little endian format.

Byte#22 - Bit#6: The Bracelet key type determines whether the device is still using the static Factory
Key (0x43EA5F35659859874A6F184742C32B2B) as the Bracelet Key (Bit#6 = 0) or the Bracelet Key
has been modified by the Mobile App to a custom one (Bit#6 = 1). This field helps the Mobile App to
identify the Bracelets that are in factory mode and are awaiting pairing for the first time using the
Factory Key.

Byte#22 - Bit#7: This bit indicates that there is at least one event that is currently active. The mobile
app shall establish a secure connection with the bracelet to obtain further information.

Byte#22 - Bit#3-5: These bitfields present an estimate of the battery level. Five levels of FULL, GOOD,
MEDIUM, LOW and CRITICAL are supported.

Byte#22 - Bit#2: Battery is being charged (1) or not (0).
Gatt Server Setup on Bracelet
The Bracelet in BLE peripheral role provides a Gatt Service (UUID 0xF021) containing two custom BLE
characteristics for requests/responses as described below:

BLE Request Characteristic with UUID 0xF023:  
The App uses this characteristic to write/send requests to the Bracelet. This characteristic supports the
WRITE property with WRITABLE permission.

CONFIDENTIALITY: The information in this document is confidential and exclusive to Motsai and  
Gently. It shall not be reproduced, disclosed or used without written authorization from Motsai or Gently. Page 11 of 32

            P308 - 2101 Rev 0.2 - Gently Bracelet Secure Bluetooth Communication Protocol

BLE Response/Notification Characteristic with UUID 0xF024:  
Upon establishing a BLE connection, the App shall activate notifications on this BLE characteristic to
receive responses/data notifications from the Bracelet. This characteristic supports the NOTIFY
property with both READABLE and WRITABLE permissions.
BLE Generic Packet Formats
The BLE packets exchanged between the Bracelet and the host device via the Request/Response BLE
characteristics are described in detail throughout the rest of this document.

In the generic form, the requests (App ⇒ Bracelet) are written to the UUID 0xF023 characteristic, while
the responses and data notifications (Bracelet ⇒ App) are sent via the UUID 0xF024.

The generic form of a request packet prior to encryption is as follows:

Mobile App Request Format (written to UUID 0xF023)
Byte#0 Byte#1 Byte#2-X
API Version Command Code Variable Payload Depending
(0x01-0xFF) on Command Code

The API Version for the first release of the protocol will be set to 0x01.

The generic form of a response/notification packet sent from the Bracelet to the mobile app prior to
encryption is as follows:

Bracelet Response/Notification Format (notifications via UUID 0xF024)
Byte#0 Byte#1 Byte#2 Byte#3-X
API Version Command Code Response Status Variable depending on
(0x01-0xFF) OK (0x00) command code
ERROR (0x01-0xFF)
Command List
The list of supported commands in API Version 0x01 are shown in the table below:

Command Code Message Type Encryption Key
Get Uptime (0x01) - Request (App ⇒ Bracelet) Bracelet Key

- Response (Bracelet ⇒ App)
  Get Device Info (0x02) - Request (App ⇒ Bracelet) Dynamic Key

CONFIDENTIALITY: The information in this document is confidential and exclusive to Motsai and  
Gently. It shall not be reproduced, disclosed or used without written authorization from Motsai or Gently. Page 12 of 32

            P308 - 2101 Rev 0.2 - Gently Bracelet Secure Bluetooth Communication Protocol

- Response (Bracelet ⇒ App)
  Get Event (0x03) - Request (App ⇒ Bracelet) Dynamic Key
- Response (Bracelet ⇒ App)
  Add Event (0x04) - Request (App ⇒ Bracelet) Dynamic Key
- Response (Bracelet ⇒ App)
  Set Event ON/OFF (0x05) - Request (App ⇒ Bracelet) Dynamic Key
- Response (Bracelet ⇒ App)
  Retrieve All Events (0x06) - Request (App ⇒ Bracelet) Dynamic Key
- Response (Bracelet ⇒ App)
  Remove Event (0x07) - Request (App ⇒ Bracelet) Dynamic Key
- Response (Bracelet ⇒ App)
  Remove All Events (0x08) - Request (App ⇒ Bracelet) Dynamic Key
- Response (Bracelet ⇒ App)
  Get Number of Events (0x09) - Request (App ⇒ Bracelet) Dynamic Key
- Response (Bracelet ⇒ App)
  Get Time (0x0A) - Request (App ⇒ Bracelet) Dynamic Key
- Response (Bracelet ⇒ App)
  Set Time (0x0B) - Request (App ⇒ Bracelet) Dynamic Key
- Response (Bracelet ⇒ App)
  Get Device Status (0x0C) - Request (App ⇒ Bracelet) Dynamic Key
  (#of Active events, battery, errors, - Response (Bracelet ⇒ App)
  etc., retrieved on demand)
  Acknowledge Event (0x0D) - Request (App ⇒ Bracelet) Dynamic Key
- Response (Bracelet ⇒ App)
  Set Bracelet Key (0x0E) - Request (App ⇒ Bracelet) Dynamic Key
  Used to change the default factory - Response (Bracelet ⇒ App)
  Bracelet Key
  Get Bracelet Key (0x0F) - Request (App ⇒ Bracelet) Dynamic Key
  Retrieves the current active - Response (Bracelet ⇒ App)
  Bracelet Key
  Find Me (0x10) - Request (App ⇒ Bracelet) Dynamic Key
  Triggers a 15s audio pattern on - Response (Bracelet ⇒ App)
  the device
  Enter DFU Mode (0x11) - Request (App ⇒ Bracelet) Dynamic Key
  Puts the Bracelet into Device - Response (Bracelet ⇒ App)
  Firmware Update (DFU) mode

CONFIDENTIALITY: The information in this document is confidential and exclusive to Motsai and  
Gently. It shall not be reproduced, disclosed or used without written authorization from Motsai or Gently. Page 13 of 32

            P308 - 2101 Rev 0.2 - Gently Bracelet Secure Bluetooth Communication Protocol

Battery Status Notify (0x80) - Notification (Bracelet ⇒ App) Dynamic Key
Battery voltage sent periodically to
the app (once every minute)
Active Event Notify (0x81) - Notification (Bracelet ⇒ App) Dynamic Key
(If an event is active/in-snooze or
pending acknowledgement from
the app, its index and status are
sent to the app once every 5s.
Furthermore, if the event becomes
inactive the new state is sent to
the app only once)
Time Notify (0x82) - Notification (Bracelet ⇒ App) Dynamic Key
(The current local time sent
periodically to the app (once every
10 minutes)

Get Uptime (Command 0x01)
Upon establishing a BLE connection with Bracelet, the host/mobile app shall send a request to the
Bracelet to retrieve its 8-byte uptime as depicted in Figure 1. This communication is encrypted using
the 16-byte Bracelet Key. The 8-byte uptime is later used alongside the Bracelet’s 8-byte unique ID
available within the BLE advertisement packet as well as the Bracelet Key to produce a new Dynamic
Key, which guarantees that the encryption key is different for each connection session.

The request sent via UUID 0xF023 is as follows:

App Request to Get Bracelet Uptime
Byte#0 Byte#1 Byte#2-7
API Version Command Code: 0x01 RESERVED (0 Padded)
(Get Uptime)

The above packet is encrypted using the Bracelet Key.

In response, Bracelet will provide its 8-byte uptime in Uint64 format via UUID 0xF024 notification as
follows:

Bracelet Response to Provide its Uptime
Byte#0 Byte#1 Byte#2 Byte#3-10 Byte#11-15
API Version Command Code: 0x01 Response Status Uptime RESERVED  
(Get Uptime) OK (0x00) Uint64 (0 Padded)

CONFIDENTIALITY: The information in this document is confidential and exclusive to Motsai and  
Gently. It shall not be reproduced, disclosed or used without written authorization from Motsai or Gently. Page 14 of 32

            P308 - 2101 Rev 0.2 - Gently Bracelet Secure Bluetooth Communication Protocol

Similar to the other integer fields, the Uptime (Uint64) is in little-endian format with Byte#2 being the
LSB, and Byte#9 being the MSB. The above packet is also encrypted using the Bracelet Key.

Note that the Command Code 0x01 (Get Uptime) is the only request/response that is encrypted using
the Bracelet Key. All other requests/responses/notifications shall be encrypted using the Dynamic Key.

Creation of new Dynamic Key
Upon retrieving the Bracelet uptime, both the mobile-app and Bracelet nodes shall create a new
Dynamic Key to send further messages to each other. The Dynamic Key is NOT required to be stored
in permanent memory, as it will be re-generated in the next BLE connection session.

The 16-byte Dynamic Key is produced using the 16-byte Bracelet Key, the 8-byte Uptime and the
8-byte serial number, which appears as Byte#1-8 of the manufacturer specific payload within the BLE
advertisement packet.

The calculation of Dynamic Key is described below:
DynamicKey[0:15] = ( BraceletKey[0:15] ) XOR { Uptime[0:7], ( Uptime[0:7] XOR SerialNumber[0:7] ) }

where XOR is the bitwise XOR operation, and the { X, Y } refers to the concatenation of two 8-byte
arrays X, Y producing a 16-byte output array.

All upcoming Requests/Responses for the Bracelet shall be encrypted with the new Dynamic Key for as
long as the Mobile App remains connected to the Bracelet.

Throughout the rest of this document, the command codes and messages presented shall be encrypted
using the Dynamic Key.  
Get Device Info (Command 0x02)
Upon establishing a BLE connection with Bracelet and creating a new Dynamic Key, the host/mobile
app shall send this request to the Bracelet to not only retrieve its device information as shown in Figure
1, but also to indirectly inform the Bracelet that it has succeeded in creating the new Dynamic Key.

NOTE: If the Mobile App does not send this request to the Bracelet within 5 seconds of establishing a
new BLE connection, the Bracelet will refuse the connection and it will disconnect itself from the mobile
app.

The request sent via UUID 0xF023 is as follows:

App Request to Get Bracelet Device Info

CONFIDENTIALITY: The information in this document is confidential and exclusive to Motsai and  
Gently. It shall not be reproduced, disclosed or used without written authorization from Motsai or Gently. Page 15 of 32

            P308 - 2101 Rev 0.2 - Gently Bracelet Secure Bluetooth Communication Protocol

Byte#0 Byte#1 Byte#2-7
API Version Command Code: 0x02 RESERVED (0 Padded)
(Get Device Info)

The request packet is encrypted using the Dynamic Key.

In response, Bracelet will provide its Hardware and Firmware Versions via UUID 0xF024 notification as
follows:

Bracelet Response to Provide its Device Information
Byte#0 Byte#1 Byte#2 Byte#3 Byte#4 Byte#5 Byte#6 Byte#7
API Command Response Hardware Firmware Firmware Firmware RESERVED
Version 0x01 Status Version Version Version Build (0 Padded)
(Get Info) OK (0x00) Major Minor Number

The response packet is also encrypted using the Dynamic Key.

At this point, the mobile application is fully authorized on the Bracelet, and the device will allow further
Bluetooth messages to be exchanged between them.

Get Event (Command 0x03)
This command retrieves the information about a specific event stored in the permanent memory of the
Bracelet. The event is referenced by its index or slot number in the memory, which is a number varying
between 0-49 (up to 50 events may be stored in the permanent memory).

The request sent via UUID 0xF023 is as follows:

App Request to Get a specific Event
Byte#0 Byte#1 Byte#2 Byte#3-7
API Version Command Code: Event Index RESERVED  
0x03 (Get Event) Uint8 (0-49) (0 Padded)

The request packet is encrypted using the Dynamic Key.

In response, if the specific event index is configured in the permanent memory of the Bracelet (either
being ON or OFF), it will respond to provide the information related to the specific event as follows:

Bracelet OK Response to Get Event request (24 bytes)

CONFIDENTIALITY: The information in this document is confidential and exclusive to Motsai and  
Gently. It shall not be reproduced, disclosed or used without written authorization from Motsai or Gently. Page 16 of 32

            P308 - 2101 Rev 0.2 - Gently Bracelet Secure Bluetooth Communication Protocol

Byte#0 Byte#1 Byte#2 Byte#3 Byte#4
API Command Response Index Event Current State (Uint8)
Version (0x03) Status OK (0-49) 0x00 (OFF)
(0x00) 0x01 (ON, but inactive)
0x02 (ON & active in vibration)
0x03 (ON & active in 5min retrigger delay)
0x04 (ON & active in 5min snooze period)
0x05-0xFF (RESERVED)

Byte#5 Byte#6
Bits#0-5 Bits6-7 Bits#0-4 Bits#5-7
Vibration Vibration Intensity LED Pattern LED color
Pattern 0x00 (LOW) 0x00 (OFF) 0 (OFF)
(0-63) 0x01 (MEDIUM) 0x01 (blink slow) 1 (Blue)
Patterns TBD 0x02 (HIGH) 0x02 (blink fast) 2 (Green)
0x03 (MAXIMUM) 0x03-0x1F (RESERVED) 3 (Cyan)
4 (Red)
5 (Yellow)
6 (Magenta)
7 (White)

Byte#7 Byte#8 Byte#9 Byte#10 Byte#11
Severity Level Snooze period Snooze timeout Retrigger Retrigger
0x00 (Snoozabe & Uint8 (minutes) Uint8 (minutes) delay in timeout
disable on device) minutes Uint8
0x01 (Snoozable, but Ignored if 0 or the Ignored if 0 or the (Uint8) (minutes)
cannot disable on event is not event is not  
device) snoozable. Upon snoozable. A snooze Acts similar to Acts similar
0x02 (Not snoozable, each snooze, the may occur for up to Snooze period to Snooze
Cannot disable on device remains in this many minutes timeout
device) sleep for this many after initial trigger  
0x03-0xFF minutes before  
(RESERVED) reactivating.

Byte#12-X Byte#X+1:Y Byte#Y+1:Z
Max(X) = 22 Max(Y) = 65 Max(Z) = 71
Event Name Cron expression (5 fields) RESERVED
Max: 10 characters string followed by “\0” (0x00) (0 Padded)
char[0:9] plus 1 Max: 42 characters plus 1
character for “\0” (0x00) character for “\0”

CONFIDENTIALITY: The information in this document is confidential and exclusive to Motsai and  
Gently. It shall not be reproduced, disclosed or used without written authorization from Motsai or Gently. Page 17 of 32

            P308 - 2101 Rev 0.2 - Gently Bracelet Secure Bluetooth Communication Protocol

NOTE: We make use of the standard 5-field Unix/Linux Cron Expression with the following fields:

---

# | | | | |

# | | | | day of the week (0–6) (Sunday to Saturday;

# | | | month (1–12) 7 is NOT recognized as Sunday)

# | | day of the month (1–31)

# | hour (0–23)

# minute (0–59)

where the following symbols are supported:

Cron Symbol Cron Symbol Meaning

- Wildcard — every possible value (e.g., \* in hours = every hour)
  , List — separate multiple values (e.g., 1,15,30 in minute = at 1, 15, 30)

* Range — define a range of values (e.g., 1-5 = from 1 to 5)
  / Step — intervals within a range or wildcard (e.g., \*/10 = every 10 units)

NOTE: Due to memory limitations on the bracelet and the requirement to store up to 50 events, the
cron expression string shall not exceed 42 characters.

If the snooze period (Byte#8) is set to 0x05 (minutes), and the snooze timeout (Byte#9) is set to 0x0F
(15 minutes), then each snooze period lasts for 5 minutes, and the snooze function may be triggered
for up to 15 minutes after the initial trigger of the event. The same logic will apply to the Retrigger delay
and retrigger timeout in minutes (Byte#10 and Byte#11).

If the event index does not exist in the memory of the bracelet, an error response will be sent instead as
shown below:

Bracelet ERROR Response to Get Event request (8 bytes)
Byte#0 Byte#1 Byte#2 Byte#3 Byte#4-7
API Version Command Response Status Event Index RESERVED  
(0x03) ERROR (0x01) (0 PaddeD)

The response packets are encrypted using the Dynamic Key.

CONFIDENTIALITY: The information in this document is confidential and exclusive to Motsai and  
Gently. It shall not be reproduced, disclosed or used without written authorization from Motsai or Gently. Page 18 of 32

            P308 - 2101 Rev 0.2 - Gently Bracelet Secure Bluetooth Communication Protocol

Add Event (Command 0x04)
This command is used to add a new event to the Bracelet. The event is referenced by its index or slot
number in the memory, which is a number varying between 0-49 (up to 50 events may be stored in the
device’s permanent memory).

The request sent via UUID 0xF023 is as follows:

App Request to Add a specific event
Byte#0 Byte#1 Byte#2
API Version Command Code: Event Index  
0x04 (Add Event) Uint8 (0-49)

Byte#3 Byte#4
Bits#0-5 Bits6-7 Bits#0-4 Bits#5-7
Vibration Vibration Intensity LED Pattern LED color
Pattern 0x00 (LOW) 0x00 (OFF) 0 (OFF)
(0-63) 0x01 (MEDIUM) 0x01 (blink slow) 1 (Blue)
Patterns TBD 0x02 (HIGH) 0x02 (blink fast) 2 (Green)
0x03 (MAXIMUM) 0x03-0x1F (RESERVED) 3 (Cyan)
4 (Red)
5 (Yellow)
6 (Magenta)
7 (White)

Byte#5 Byte#6 Byte#7 Byte#8 Byte#9
Severity Level Snooze period Snooze timeout Retrigger Retrigger
0x00 (Snoozabe & Uint8 (minutes) Uint8 (minutes) delay in timeout
disable on device) minutes Uint8
0x01 (Snoozable, but Ignored if 0 or the Ignored if 0 or the (Uint8) (minutes)
cannot disable on event is not event is not  
device) snoozable. Upon snoozable. A snooze Acts similar Acts similar
0x02 (Not snoozable, each snooze, the may occur for up to to Snooze to Snooze
Cannot disable on device remains in this many minutes period timeout
device) sleep for this many after initial trigger  
0x03-0xFF minutes before  
(RESERVED) reactivating.

Byte#6-X Byte#X+1:Y Byte#Y+1:Z

CONFIDENTIALITY: The information in this document is confidential and exclusive to Motsai and  
Gently. It shall not be reproduced, disclosed or used without written authorization from Motsai or Gently. Page 19 of 32

            P308 - 2101 Rev 0.2 - Gently Bracelet Secure Bluetooth Communication Protocol

Max(X) = 20 Max(Y) = 63 Max(Z) = 71
Event Name Cron expression (5 fields) RESERVED
Max: 10 characters string followed by “\0” (0x00) (0 Padded)
char[0:9] plus 1 Max: 42 characters plus 1
character for “\0” (0x00) character for “\0”

In response, the bracelet will send the following packet:

Bracelet Response to Add Event request
Byte#0 Byte#1 Byte#2 Byte#3 Byte#4-7
API Command Code: Response Status Event Index RESERVED  
Version 0x04 (Add Event) OK (0x00) (0-49) (0 Padded)
ERROR (0x01)

Set Event ON/OFF (Command 0x05)
This command is used to set an existing event to ON or OFF state.

The request sent via UUID 0xF023 is as follows:

App Request to Set a specific event to ON/OFF state
Byte#0 Byte#1 Byte#2 Byte#3 Byte#4-7
API Version Command: 0x05 Event Index State RESERVED  
(Set Event) Uint8 (0-49) OFF (0x00) (0 Padded)
ON (0x01)

In response, the bracelet will send the following packet:

Bracelet Response to Set Event request
Byte#0 Byte#1 Byte#2 Byte#3 Byte#4-7
API Command: 0x05 Response Status Event Index RESERVED  
Version (Set Event) OK (0x00) (0-49) (0 Padded)
ERROR (0x01)

CONFIDENTIALITY: The information in this document is confidential and exclusive to Motsai and  
Gently. It shall not be reproduced, disclosed or used without written authorization from Motsai or Gently. Page 20 of 32

            P308 - 2101 Rev 0.2 - Gently Bracelet Secure Bluetooth Communication Protocol

Get All Events (Command 0x06)
This command retrieves the information about all the events stored in the permanent memory of the
Bracelet.

The request sent via UUID 0xF023 is as follows:

App Request to Get All Events

Byte#0 Byte#1 Byte#2-7
API Version Command Code: 0x06 RESERVED  
(Get All Events) (0 Padded)

The request packet is encrypted using the Dynamic Key.

In response, the Bracelet will send multiple packets, one for each configured event in its permanent
memory. Assuming that we have a total of N available events, N response packets will be sent with the
following format:

Bracelet OK Response(s) to Get All Events request (24 bytes)
Byte#0 Byte#1 Byte#2 Byte#3 Byte#4
API Command Response Packet number Total Packets Expected (N)
Version (0x06) Status OK Uint8 Uint8
(0x00) (1, …, N)

Byte#5 Byte#6
Current Event Index (0-49) Event Current State (Uint8)
0x00 (OFF)
This is the current index (slot number) 0x01 (ON, but inactive)
allocated in the bracelet’s memory 0x02 (ON & active in vibration)
0x03 (ON & active in 5min retrigger delay)
0x04 (ON & active in 5min snooze period)
0x05-0xFF (RESERVED)

Byte#7 Byte#8
Bits#0-5 Bits6-7 Bits#0-4 Bits#5-7
Vibration Vibration Intensity LED Pattern LED color
Pattern 0x00 (LOW) 0x00 (OFF) 0 (OFF)

CONFIDENTIALITY: The information in this document is confidential and exclusive to Motsai and  
Gently. It shall not be reproduced, disclosed or used without written authorization from Motsai or Gently. Page 21 of 32

            P308 - 2101 Rev 0.2 - Gently Bracelet Secure Bluetooth Communication Protocol

(0-63) 0x01 (MEDIUM) 0x01 (blink slow) 1 (Blue)
Patterns TBD 0x02 (HIGH) 0x02 (blink fast) 2 (Green)
0x03 (MAXIMUM) 0x03-0x1F (RESERVED) 3 (Cyan)
4 (Red)
5 (Yellow)
6 (Magenta)
7 (White)

Byte#9 Byte#10 Byte#11 Byte#12 Byte#13
Severity Level Snooze period Snooze timeout Retrigger Retrigger
0x00 (Snoozabe & Uint8 (minutes) Uint8 (minutes) delay in timeout
disable on device) minutes Uint8
0x01 (Snoozable, but Ignored if 0 or the Ignored if 0 or the (Uint8) (minutes)
cannot disable on event is not event is not  
device) snoozable. Upon snoozable. A snooze Acts similar Acts similar
0x02 (Not snoozable, each snooze, the may occur for up to to Snooze to Snooze
Cannot disable on device remains in this many minutes period timeout
device) sleep for this many after initial trigger  
0x03-0xFF minutes before  
(RESERVED) reactivating.

Byte#14-X Byte#X+1:Y Byte#Y+1:Z
Max(X) = 24 Max(Y) = 67 Max(Z) = 71
Event Name Cron expression (5 fields) RESERVED
Max: 10 characters string followed by “\0” (0x00) (0 Padded)
char[0:9] plus 1 Max: 42 characters plus 1
character for “\0” (0x00) character for “\0”
Remove Event (Command 0x07)
This command is used to remove an existing event from the bracelet.

The request sent via UUID 0xF023 is as follows:

App Request to Remove a specific event
Byte#0 Byte#1 Byte#2 Byte#3-7
API Command: 0x07 Event Index RESERVED  
(Remove Event) Uint8 (0-49) (0 Padded)

CONFIDENTIALITY: The information in this document is confidential and exclusive to Motsai and  
Gently. It shall not be reproduced, disclosed or used without written authorization from Motsai or Gently. Page 22 of 32

            P308 - 2101 Rev 0.2 - Gently Bracelet Secure Bluetooth Communication Protocol

In response, the bracelet will send the following packet:

Bracelet Response to Remove Event request
Byte#0 Byte#1 Byte#2 Byte#3 Byte#4-7
API Command: 0x07 Response Status Event Index RESERVED  
(Remove Event) OK (0x00) (0-49) (0 Padded)
ERROR (0x01)

Remove All Events (Command 0x08)
This command is used to remove all events from the bracelet.

The request sent via UUID 0xF023 is as follows:

App Request to Remove all events
Byte#0 Byte#1 Byte#2-7
API Version Command: 0x08 RESERVED  
(Remove All Events) (0 Padded)

In response, the bracelet will send the following packet:

Bracelet Response to Remove All Events request
Byte#0 Byte#1 Byte#2 Byte#3-7
API Version Command: 0x08 Response Status RESERVED
(Remove All Events) OK (0x00) (0 Padded)
ERROR (0x01)

NOTE: Depending on the number of configured events, this action might take up to 1s, which causes a
delay in receiving the response from the bracelet.

Get Number of Events (Command 0x09)
This command is used to retrieve the total number of events configured on the bracelet.

The request sent via UUID 0xF023 is as follows:

App Request to Get Number of Events

CONFIDENTIALITY: The information in this document is confidential and exclusive to Motsai and  
Gently. It shall not be reproduced, disclosed or used without written authorization from Motsai or Gently. Page 23 of 32

            P308 - 2101 Rev 0.2 - Gently Bracelet Secure Bluetooth Communication Protocol

Byte#0 Byte#1 Byte#2-7
API Version Command: 0x09 RESERVED  
(Get Number of Events) (0 Padded)

In response, the bracelet will send the following packet:

Bracelet Response to Get Number of Events request
Byte#0 Byte#1 Byte#2 Byte#3 Byte#4-7
API Version Command: 0x09 Response Status Total Number of RESERVED
(Get Number of OK (0x00) Events (0 Padded)
Events) ERROR (0x01) Uint8 (0-49)

Get Time (Command 0x0A)
This command is used to retrieve the current date and local time on the bracelet.

The request sent via UUID 0xF023 is as follows:

App Request to Get Time
Byte#0 Byte#1 Byte#2-7
API Version Command: 0x0A RESERVED  
(Get Time) (0 Padded)

In response, the bracelet will send the following packet:

Bracelet Response to Get Time request
Byte#0 Byte#1 Byte#2
API Version Command: 0x0A Response Status  
(Get Time) OK (0x00)
ERROR (0x01)

Byte#3 Byte#4 Byte#5
Year Month Date
Uint8 in BCD format Uint8 in BCD format (0x01-0x12) Uint8 in BCD format (0x01-0x31)
(0x00-0x99) (2000-2099) Example: 0x03 - March Example: 0x30 (30th)

CONFIDENTIALITY: The information in this document is confidential and exclusive to Motsai and  
Gently. It shall not be reproduced, disclosed or used without written authorization from Motsai or Gently. Page 24 of 32

            P308 - 2101 Rev 0.2 - Gently Bracelet Secure Bluetooth Communication Protocol

Byte#6 Byte#7 Byte#8 Byte#9 Byte#10-15
Week day Local time hour Local time minute Local time seconds RESERVED  
Uint8 (0-6) Uint8 in BCD format Uint8 in BCD format Uint8 in BCD format (0 Padded)
Sunday (0x00) (0x00-0x23) (0x00-0x59) (0x00-0x59)
Monday (0x01)
Tuesday (0x02)
Wednesday (0x03)
Thursday (0x04)
Friday (0x05)
Saturday (0x06)
Set Time (Command 0x0B)
This command is used to set/re-sync the clock and local time on the bracelet.

NOTE: The bracelet's internal clock is expected to drift over time, i.e., on average 1-2 seconds per day,
and further when the battery dies, it loses track of time. The bracelet does not produce the local time
zone either and it cannot adjust the daylight saving time (DST) automatically. Therefore, it will be the
mobile application's responsibility to send this command as often as required to account for such
limitations.

The request sent via UUID 0xF023 is as follows:

App Request to Set Time
Byte#0 Byte#1
API Version Command: 0x0B
(Set Time)

Byte#2 Byte#3 Byte#4
Year Month Date
Uint8 in BCD format Uint8 in BCD format (0x01-0x12) Uint8 in BCD format (0x01-0x31)
(0x00-0x99) (2000-2099) Example: 0x03 - March Example: 0x30 (30th)

Byte#5 Byte#6 Byte#7 Byte#8 Byte#9-15
Week day Local time hour Local time minute Local time seconds RESERVED  
Uint8 (0-6) Uint8 in BCD format Uint8 in BCD format Uint8 in BCD format (0 Padded)
Sunday (0x00) (0x00-0x23) (0x00-0x59) (0x00-0x59)
Monday (0x01)
Tuesday (0x02)
Wednesday (0x03)

CONFIDENTIALITY: The information in this document is confidential and exclusive to Motsai and  
Gently. It shall not be reproduced, disclosed or used without written authorization from Motsai or Gently. Page 25 of 32

            P308 - 2101 Rev 0.2 - Gently Bracelet Secure Bluetooth Communication Protocol

Thursday (0x04)
Friday (0x05)
Saturday (0x06)

In response, the bracelet will send the following packet:

Bracelet Response to Set Time request
Byte#0 Byte#1 Byte#2 Byte#3-7
API Command: 0x0B Response Status RESERVED
(Set Time) OK (0x00) (0 Padded)
ERROR (0x01)

Get Device Status (Command 0x0C)
This command is used to retrieve the current battery status as well as the number of active events on
the bracelet.

The request sent via UUID 0xF023 is as follows:

App Request to Get Device Status
Byte#0 Byte#1 Byte#2-7
API Version Command: 0x0C RESERVED  
(Get Device Status) (0 Padded)

In response, the bracelet will send the following packet:

Bracelet Response to Get Device Status request
Byte#0 Byte#1 Byte#2 Byte#3-4
API Version Command: 0x0C Response Status Battery voltage in mV
(Get Device Status) OK (0x00) Uint16 (little endian)
ERROR (0x01)

Byte#5 Byte#6 Byte#7
Bit#0 (Left-most) Bit#1-7
Charging Battery Level #of Currently Active Events RESERVED
(ON: 1) (Estimate) - Uint8 Uint8 (0 Padded)
(OFF: 0) 0x00 (CRITICAL)

CONFIDENTIALITY: The information in this document is confidential and exclusive to Motsai and  
Gently. It shall not be reproduced, disclosed or used without written authorization from Motsai or Gently. Page 26 of 32

            P308 - 2101 Rev 0.2 - Gently Bracelet Secure Bluetooth Communication Protocol

0x01 (LOW)
0x02 (MEDIUM)
0x03 (GOOD)
0x04 (FULL)

The 16-bit error bitmask is the same field in the BLE advertisement packet described here.
Acknowledge Event (Command 0x0D)
This command is used to acknowledge/stop an ongoing active event.

The request sent via UUID 0xF023 is as follows:

App Request to Acknowledge a specific event
Byte#0 Byte#1 Byte#2 Byte#3-7
API Command: 0x0D Event Index RESERVED  
(Acknowledge Event) Uint8 (0-49) (0 Padded)

In response, the bracelet will send the following packet:

Bracelet Response to Acknowledge Event request
Byte#0 Byte#1 Byte#2 Byte#3 Byte#4-7
API Command: 0x0D Response Status Event Index RESERVED  
(Acknowledge Event) OK (0x00) (0-49) (0 Padded)
ERROR (0x01)

Set Bracelet Key (Command 0x0E)
This command is used to change the default value for the Bracelet Key, where the default value is a
static string used during initial pairing (0x43EA5F35659859874A6F184742C32B2B). The mobile app
shall send this command upon establishing the first secure connection with a bracelet in factory mode
to create a unique key for it.

The request sent via UUID 0xF023 is as follows:

App Request to Set Bracelet Key
Byte#0 Byte#1 Byte#2-17 Byte#18-23
API Command: 0x0E Bracelet Key RESERVED  
(Set Bracelet Key) (16 bytes) Uint8[0:15] (0 Padded)

CONFIDENTIALITY: The information in this document is confidential and exclusive to Motsai and  
Gently. It shall not be reproduced, disclosed or used without written authorization from Motsai or Gently. Page 27 of 32

            P308 - 2101 Rev 0.2 - Gently Bracelet Secure Bluetooth Communication Protocol

The request is encrypted using the Dynamic Key that has already been generated for the currently
active BLE connection session.

In response, the bracelet will send the following packet:

Bracelet Response to Set Bracelet Key request
Byte#0 Byte#1 Byte#2 Byte#3-7
API Command: 0x0E Response Status RESERVED  
(Set Bracelet Key) OK (0x00) (0 Padded)
ERROR (0x01)

The response packet is also encrypted using the Dynamic Key that has already been generated for the
currently active BLE connection session.

NOTE: The new set Bracelet Key will be used in the next BLE connection session to create the
Dynamic Key, and the current connection session will continue to use the already generated Dynamic
Key for the upcoming requests/responses.
Get Bracelet Key (Command 0x0F)
This command may be used by the mobile app to double-check and verify that for instance a change in
the Bracelet Key via the Set Bracelet Key command has been successful or not before closing the
currently active BLE connection session, which necessitates using the new Bracelet Key in the
upcoming connection.

The request sent via UUID 0xF023 is as follows:

App Request to Get Bracelet Key
Byte#0 Byte#1 Byte#2-7
API Version Command: 0x0F RESERVED  
(Get Bracelet Key) (0 Padded)

The request is encrypted using the Dynamic Key that has already been generated for the currently
active BLE connection session.

In response, the bracelet will send the following packet:

Bracelet Response to Get Bracelet Key request
Byte#0 Byte#1 Byte#2 Byte#3-18 Byte#19-23

CONFIDENTIALITY: The information in this document is confidential and exclusive to Motsai and  
Gently. It shall not be reproduced, disclosed or used without written authorization from Motsai or Gently. Page 28 of 32

            P308 - 2101 Rev 0.2 - Gently Bracelet Secure Bluetooth Communication Protocol

API Command: 0x0F Response Status Bracelet Key RESERVED  
(Get Bracelet Key) OK (0x00) (16 bytes) (0 Padded)
ERROR (0x01)

The response packet is also encrypted using the Dynamic Key that has already been generated for the
currently active BLE connection session.

Find Me (Command 0x10)
This command triggers a 15s audio pattern sound on the Bracelet serving as a “find me” feature.

The request sent via UUID 0xF023 is as follows:

App Request to Find Me
Byte#0 Byte#1 Byte#2 Byte#3-7
API Version Command Code: Audio Pattern RESERVED  
0x10 Uint8 (0 Padded)
(Find Me) 0x00-0xFF (Pattern TBD)

The request packet is encrypted using the Dynamic Key.

In response, the Bracelet will send an OK/ERROR response as follows:

Bracelet Response to Find Me request
Byte#0 Byte#1 Byte#2 Byte#3-7
API Version Command: 0x10 Response Status RESERVED  
(Find Me) OK (0x00) (0 Padded)
ERROR (0x01)

Enter DFU Mode (Command 0x11)
This command is used to reboot the Bracelet into a special mode, called the Device Firmware Update
(DFU) mode to receive a new firmware image via Bluetooth. The Bluetooth protocol involved in the
DFU procedure and file transfer is different from the protocol outlined in this document and it will be
done in a standard fashion based on the GATT DFU SMP Service Client.

The request sent via UUID 0xF023 is as follows:

App Request to Enter DFU Mode

CONFIDENTIALITY: The information in this document is confidential and exclusive to Motsai and  
Gently. It shall not be reproduced, disclosed or used without written authorization from Motsai or Gently. Page 29 of 32

            P308 - 2101 Rev 0.2 - Gently Bracelet Secure Bluetooth Communication Protocol

Byte#0 Byte#1 Byte#2-7
API Version Command: 0x11 RESERVED  
(Enter DFU Mode) (0 Padded)

The request is encrypted using the Dynamic Key.

In response, the Bracelet will send an OK/ERROR response as follows:

Bracelet Response to Enter DFU Mode request
Byte#0 Byte#1 Byte#2 Byte#3-7
API Version Command: 0x11 Response Status RESERVED  
(Enter DFU Mode) OK (0x00) (0 Padded)
ERROR (0x01)

The response is also encrypted using the Dynamic Key.

In case of an OK response, the Bracelet will then reboot and re-initialize its Bluetooth core based on the
GATT DFU SMP Service Client and it will advertise the BLE device name “Gently-DFU”.

An open-source mobile application for both iOS and Android called “Device Manager” is provided by
Nordic Semiconductor, which is also available on Google Play and App Store with the following icon:

The open-source Device Manager mobile application can be used to transfer a signed firmware image
via Bluetooth to a Bracelet device that is already put into the DFU mode.

The Bracelet device will remain in the DFU mode for 1 minute, and if no BLE connection has been
established with the host application during this time (to receive a new firmware image), the Bracelet
will reboot in normal mode.

If the Bracelet receives an invalid firmware image in the DFU mode, e.g., an image with an invalid
signature, it will refuse the new image and it will reboot in normal mode with its existing firmware
version.

When the Bracelet reboots in normal mode and it terminates the DFU mode, it will continue to use the
Bluetooth protocol outlined in this document.

CONFIDENTIALITY: The information in this document is confidential and exclusive to Motsai and  
Gently. It shall not be reproduced, disclosed or used without written authorization from Motsai or Gently. Page 30 of 32

            P308 - 2101 Rev 0.2 - Gently Bracelet Secure Bluetooth Communication Protocol

Battery Status Notify (Command 0x80)
This is an asynchronous notification reporting battery status, which is periodically sent from the bracelet
to the mobile app. This packet is sent once every minute to the mobile app upon establishing a secure
connection.

The asynchronous notification has the following format:

Bracelet’s asynchronous notification to the mobile app to report battery status
Byte#0 Byte#1 Byte#2 Byte#3-4 Byte#5
Bit#0 Bit#1-7
(Left-most)
API Command: RESERVED Battery Charging Battery Level  
0x80 (0x00) Voltage in mV (ON: 1) (Estimate) - Uint8
(Battery Notify) Uint16 (OFF: 0) 0x00 (CRITICAL)
(little endian) 0x01 (LOW)
0x02 (MEDIUM)
0x03 (GOOD)
0x04 (FULL)

Byte#6-7
RESERVED (0 Padded)

The packet is encrypted using the Dynamic Key.
Active Event Notify (Command 0x81)
If there are any ongoing active events, an asynchronous notification reporting the state of the active
event will be sent to the mobile app periodically once every 5s. Furthermore, the moment an active
event becomes inactive, this notification is sent to the app as well, but it is sent only once.

The asynchronous notification has the following format:

Bracelet’s asynchronous notification to report active events or an event becoming inactive
Byte#0 Byte#1 Byte#2 Byte#3 Byte#4 Byte#5-7
API Command: RESERVED Event Event Current State RESERVED  
0x81 (0x00) Index (Uint8) (0 Padded)
(Active Event 0x00 (OFF)
Notify) 0x01 (ON, but inactive)
0x02 (ON & active in
vibration)

CONFIDENTIALITY: The information in this document is confidential and exclusive to Motsai and  
Gently. It shall not be reproduced, disclosed or used without written authorization from Motsai or Gently. Page 31 of 32

            P308 - 2101 Rev 0.2 - Gently Bracelet Secure Bluetooth Communication Protocol

0x03 (ON & active in
5min retrigger delay)
0x04 (ON & active in
5min snooze period)
0x05-0xFF (RESERVED)

The packet is encrypted using the Dynamic Key.
Time Notify (Command 0x82)
This is an asynchronous notification reporting the local time/clock to the app, which is periodically sent
from the bracelet to the mobile app. This packet is sent once every 10 minutes to the mobile app upon
establishing a secure connection. It can be used by the app to ensure that the local clock on the
bracelet is not drifting. Under such conditions, the Set Time command shall be sent to the bracelet to
re-sync its clock.

The asynchronous notification has the following format:

Bracelet’s asynchronous notification to the mobile app to report date and time
Byte#0 Byte#1 Byte#2
API Version Command Code: RESERVED
0x82 (Time Notify) (0x00)

Byte#3 Byte#4 Byte#5
Year Month Date
Uint8 in BCD format Uint8 in BCD format (0x01-0x12) Uint8 in BCD format (0x01-0x31)
(0x00-0x99) (2000-2099) Example: 0x03 - March Example: 0x30 (30th)

Byte#6 Byte#7 Byte#8 Byte#9 Byte#10-15
Week day Local time hour Local time minute Local time seconds RESERVED  
Uint8 (0-6) Uint8 in BCD format Uint8 in BCD format Uint8 in BCD format (0 Padded)
Sunday (0x00) (0x00-0x23) (0x00-0x59) (0x00-0x59)
Monday (0x01)
Tuesday (0x02)
Wednesday (0x03)
Thursday (0x04)
Friday (0x05)
Saturday (0x06)

The packet is encrypted using the Dynamic Key.

CONFIDENTIALITY: The information in this document is confidential and exclusive to Motsai and  
Gently. It shall not be reproduced, disclosed or used without written authorization from Motsai or Gently. Page 32 of 32
