FROM archlinux:latest

RUN pacman -Syu --noconfirm --needed \
    openssh \
    sudo \
  && useradd -m -s /bin/bash deploy \
  && echo "deploy:deploy" | chpasswd \
  && echo "deploy ALL=(ALL) NOPASSWD:ALL" >> /etc/sudoers \
  && ssh-keygen -A \
  && printf "\nPermitRootLogin no\nPasswordAuthentication yes\nPubkeyAuthentication no\nChallengeResponseAuthentication no\nUsePAM no\n" >> /etc/ssh/sshd_config \
  && rm -rf /var/cache/pacman/pkg/*

COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

EXPOSE 22
CMD ["/entrypoint.sh"]
