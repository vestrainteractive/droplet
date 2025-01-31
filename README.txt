Droplet by Vestra Interactive

A dead simple file drop.

To install:

Clone the repo to your device

Edit the .env file to suit your needs.  Only the port is required.

run 

docker compose build

docker compose up -d


Notes:  This type of app is inherently insecure due to the nature of public uploading to a server.  That said, we have taken a few steps to make things a bit more secure.  First, only documents, audio, video, and compressed files can be uploaded.  No Executables or scripts.  Second, on *nix based devices, the app will use clamscan (if detected) to scan any uploaded file.  If your clamscan isn't where it should be, this may not work.  This feature has only been tested on Ubuntu 20.x.

