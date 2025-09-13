.PHONY: run build fmt clean test

run:
	go run .

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