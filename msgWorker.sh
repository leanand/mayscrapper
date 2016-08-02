lastPage="$(/usr/local/bin/redis-cli get LAST_PAGE)"
emailList="$(/usr/local/bin/redis-cli --raw hlen REQUIRED_EMAILS)"

curl http://textbelt.com/text -d number=5053927444 -d "message=Last Page : ${lastPage}; Total Email :${emailList}"