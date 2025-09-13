.PHONY: run dev build fmt clean test

run:
	go run .

dev:
	air

build:
	mkdir -p dist
	go build -o dist/vm .

fmt:
	go fmt ./...

clean:
	rm -rf dist/

test:
	go test ./...

deps:
	go mod tidy