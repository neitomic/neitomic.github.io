---
layout: post
title:  "Pull docker images through VPN and Blobs caching"
date:   2020-05-30 21:21:21 +0700
tags: [infra]
---

Pull Docker images through a slow internet connection is a pain in the ass. Especially when you want to try out something new, you pull the image and wait for 30 minutes for that download process to finish, all the hype gone after that.

In my case, I was working on few servers located in Vietnam and the oversea internet connection is horrible. You might ask why can’t I just move my servers outside of Vietnam. That’s not that simple, all of my clients are in Vietnam and the oversea connection is slow for everyone (except when you pay the ISP lots of money).

So I looked into and there are few things:

1. I want a faster oversea internet connection for just pulling Docker image at an acceptable price. Pay the ISP to get a faster connection is not an option for me. So I think about VPN services.
2. I want to cache the downloaded image somewhere so that when I downloaded it on a server and want to download it for another server, I don’t want to download it from the internet again. This is possible because the Docker image blobs are immutable (with the same hash).

## Blobs caching

There are few ways to archive this.

### Image caching with Docker registry

This way is simple, you just need to run the official registry in mirror mode. Check out this [document](https://docs.docker.com/docker-hub/image-library/mirror/). The big problem with this is that the mirror mode only supports the central Docker hub for now. So you can not mirror other registries like [Google Cloud Registry](https://gcr.io), [Quay.io](https://quay.io),…

### Blobs caching with Nginx

Luckily, people have faced this problem before me.

You can follow the readme on this repository. The documentation is pretty clear and easy to follow to make it work. [https://github.com/rpardini/docker-registry-proxy](https://github.com/rpardini/docker-registry-proxy)

I provide my settings at the end of this post.

## Route image pull requests through a VPN


### Attempt 1 — VPN client on a machine

I was thinking that I can run the VPN client (OpenVPN in my case) and the registry proxy on a machine. So that all traffic come out of this server will be routed through VPN.

There is a problem with this. All the traffic is routed through the VPN, even with the traffic from the client (machine pull image through the proxy). To deal with this, I did search around on the internet and tried a few ways. And one solution that worked is using the routing table. Here it is.

```bash
ip rule add from $(ip route get 1 | grep -Po '(?<=src )(\S+)') table 128
ip route add table 128 to $(ip route get 1 | grep -Po '(?<=src )(\S+)')/32 dev $(ip -4 route ls | grep default | grep -Po '(?<=dev )(\S+)')
ip route add table 128 default via $(ip -4 route ls | grep default | grep -Po '(?<=via )(\S+)')
# Start VPN client
openvpn <your_vpn_config_file>.ovpn
```


This worked for a while until I restarted the server. After the restart, clients cannot connect to the registry proxy on this server anymore. I think it’s because I didn’t clean up the route rules and keep appending new the same rules when start.

But I felt this is not a good way, so I was looking for something better. So I think what if I run the VPN client inside a container. I did search and yes, people have done this kind of thing. This lead to the attempt number 2 — the current working solution.

### Attempt 2 — VPN client inside Docker container


I found this [https://github.com/dperson/openvpn-client](https://github.com/dperson/openvpn-client)

Basically, this will help you run an Open VPN client inside a Docker container, then run your whatever service which reuses the network stack of the VPN container. You can read more in that repository.

For my use case, I run the VPN client with the registry proxy use the network stack of the VPN. And I need to expose access to the registry proxy to all of my servers.

There are two ways to expose access (as mentioned in the document). First is using an Nginx proxy that forward all request to the registry proxy. Because we cannot use a proxy on top of another proxy (I tried). So this won’t work in this case. Second, we can expose the port directly in the VPN container. Because the registry proxy uses the same network stack so that port also applied to the proxy. (The reason we cannot bind port in the registry proxy is that you cannot use both ports and network_mode in Docker).

## Conclusion

So here is my full docker-compose


```yaml
version: '3.4'

services:
  vpn:
    image: dperson/openvpn-client
    cap_add:
      - net_admin
    environment:
      TZ: 'Asia/Bangkok'
    networks:
      - default
    ports:
      - 3128:3128
    read_only: true
    dns:
      - 8.8.8.8
      - 8.8.4.4
    tmpfs:
      - /run
      - /tmp
    restart: unless-stopped
    security_opt:
      - label:disable
    stdin_open: true
    tty: true
    volumes:
      - /dev/net:/dev/net:z
      - ./vpn:/vpn
    command: ["-r", "10.4.101.0/24"]

  registry:
    image: rpardini/docker-registry-proxy:0.3.0-beta2
    restart: always
    volumes:
     - ./cache:/docker_mirror_cache
     - ./certs:/ca
     - ./log:/var/log/nginx
    environment:
     - REGISTRIES=k8s.gcr.io gcr.io quay.io docker.elastic.co registry.private.com
     - AUTH_REGISTRIES=registry.private.com:private_user:private_password
     - CACHE_MAX_SIZE=20g
     - TZ=Asia/Bangkok
    network_mode: "service:vpn"
    stdin_open: true
    tty: true

networks:
  default:
```


Notes:

- `command: [“-r”, “10.4.101.0/24”]` is needed only when you need to access from a different subnet. By default, the connection is available for the current subnet of the machine running this stack.


Thanks for reading this. I hope this helps with your use case. Thanks.
