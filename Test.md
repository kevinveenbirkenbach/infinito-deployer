# SSH Test Credentials

This repository includes a small SSH test stack with two services:

- `ssh-password` (password authentication)
- `ssh-key` (public key authentication)

## Compose profile (recommended)

```bash
docker compose --profile test up -d --build
```

Stop it again with:

```bash
docker compose --profile test down
```

## Make targets (recommended)

Start the full test environment:

```bash
make test-env-up
```

Stop it again:

```bash
make test-env-down
```

## Password auth service

- Host (from API container): `ssh-password`
- Port (from API container): `22`
- User: `deploy`
- Password: `deploy`

Connect from host:

```bash
ssh -p 2222 deploy@localhost
```

Use in UI/API (container-to-container):

```
Host: ssh-password
Port: 22
User: deploy
Password: deploy
```

## Key auth service

- Host (from API container): `ssh-key`
- Port (from API container): `22`
- User: `deploy`
- Private key: `apps/test/ssh-key/test_id_ed25519`
- Public key: `apps/test/ssh-key/test_id_ed25519.pub`

Connect from host:

```bash
ssh -i apps/test/ssh-key/test_id_ed25519 -p 2223 deploy@localhost
```

If SSH asks about host key verification, you can bypass it for the test:

```bash
ssh -o StrictHostKeyChecking=no -i apps/test/ssh-key/test_id_ed25519 -p 2223 deploy@localhost
```

## Embedded test key (copy/paste)

Private key:

```text
-----BEGIN OPENSSH PRIVATE KEY-----
b3BlbnNzaC1rZXktdjEAAAAABG5vbmUAAAAEbm9uZQAAAAAAAAABAAAAMwAAAAtzc2gtZW
QyNTUxOQAAACCigUtlFhiovSEc9m/iY5AFhogJBQ68Z50F4rni0Eyg8wAAAJAf/nTxH/50
8QAAAAtzc2gtZWQyNTUxOQAAACCigUtlFhiovSEc9m/iY5AFhogJBQ68Z50F4rni0Eyg8w
AAAEBR9gZgUzGGRDOPEelNGNYk4qCapNn0TKobNocdi1kQsKKBS2UWGKi9IRz2b+JjkAWG
iAkFDrxnnQXiueLQTKDzAAAADWluZmluaXRvLXRlc3Q=
-----END OPENSSH PRIVATE KEY-----
```

Public key:

```text
ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIKKBS2UWGKi9IRz2b+JjkAWGiAkFDrxnnQXiueLQTKDz infinito-test
```

## Notes

- These credentials are for local testing only.
- The `ssh-key` service uses `apps/test/ssh-key/authorized_keys` which is already populated with the public key above.

## Legacy compose file (optional)

```bash
docker compose -f docker-compose.ssh-test.yml up -d --build
```
