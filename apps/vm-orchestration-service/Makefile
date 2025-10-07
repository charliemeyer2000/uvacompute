.PHONY: run dev build fmt fmty clean test deps

run:
	go run .

dev:
	air

build:
	mkdir -p dist
	go build -o dist/vm .

fmt:
	go fmt ./...

fmty:
	gofmt -w .

clean:
	rm -rf dist/

test:
	go test ./...

deps:
	go mod tidy