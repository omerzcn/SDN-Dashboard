#!/usr/bin/env python3
"""
Mininet topology so I can test the topology at home:

    Switches:  sw1 - sw2 - sw4 - sw3 - sw1
    Hosts: host1 (10.0.0.3), host2 (10.0.0.4) -> sw4
           host3 (10.0.0.5), host4 (10.0.0.6) -> sw1

Connects to a LOCAL ONOS instance (127.0.0.1:6653) started from
deploy/onos-controller/docker-compose.yml.

To run: sudo python3 topology.py
"""
from mininet.net import Mininet
from mininet.node import RemoteController, OVSSwitch
from mininet.cli import CLI
from mininet.log import setLogLevel

ONOS_IP = '127.0.0.1'
ONOS_PORT = 6653

def build():
    net = Mininet(controller=RemoteController, switch=OVSSwitch, autoSetMacs=False)

    onos = net.addController('onos', controller=RemoteController,
                              ip=ONOS_IP, port=ONOS_PORT)

    sw1 = net.addSwitch('sw1', dpid='0000000000000001', protocols='OpenFlow13')
    sw2 = net.addSwitch('sw2', dpid='0000000000000002', protocols='OpenFlow13')
    sw3 = net.addSwitch('sw3', dpid='0000000000000003', protocols='OpenFlow13')
    sw4 = net.addSwitch('sw4', dpid='0000000000000004', protocols='OpenFlow13')

    host1 = net.addHost('host1', ip='10.0.0.3/24')
    host2 = net.addHost('host2', ip='10.0.0.4/24')
    host3 = net.addHost('host3', ip='10.0.0.5/24')
    host4 = net.addHost('host4', ip='10.0.0.6/24')

    # Physical sw1<->sw2, sw1<->sw3, sw3<->sw4, sw2<->sw4 links
    net.addLink(sw1, sw2)
    net.addLink(sw1, sw3)
    net.addLink(sw3, sw4)
    net.addLink(sw2, sw4)

    # Host connections
    net.addLink(host1, sw4)
    net.addLink(host2, sw4)
    net.addLink(host3, sw1)
    net.addLink(host4, sw1)

    net.build()
    onos.start()
    for sw in (sw1, sw2, sw3, sw4):
        sw.start([onos])

    CLI(net)
    net.stop()

if __name__ == '__main__':
    setLogLevel('info')
    build()
