RATE := 10
UI   := false

server1:
	./bin/simulate.js 5001 --id 1 --host peer1 --rate $(RATE) --ui $(UI)

server2:
	./bin/simulate.js 5002 --id 2 --host peer2 --join 5001 --rate $(RATE) --ui $(UI)

server3:
	./bin/simulate.js 5003 --id 3 --host peer3 --join 5002 --rate $(RATE) --ui $(UI)

server4:
	./bin/simulate.js 5004 --id 4 --host peer4 --join 5003 --rate $(RATE) --ui $(UI)

.PHONY: server1, server2, server3, server4