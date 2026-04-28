git pull
docker compose build
docker tag efms-frontend:latest yonyc/efms-frontend:latest
docker push yonyc/efms-frontend:latest
ssh serv "cd docker/efms/ && docker compose pull && docker compose up -d"