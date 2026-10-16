FROM golang:1.25.7-alpine AS builder

WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY *.go ./
RUN go build -o pets-service .

FROM alpine:3.22
WORKDIR /app
COPY --from=builder /app/pets-service ./pets-service
USER 10001:10001
EXPOSE 4200
CMD ["./pets-service"]
