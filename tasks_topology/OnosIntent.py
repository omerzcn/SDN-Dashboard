import argparse
import subprocess
import OnosAPI
import json
import copy
import time
from itertools import combinations


import DefaultValues




# ------------------------------------------------------------------
# Task 1:
# Install a Host-to-Host intent host1 and host2
# ------------------------------------------------------------------
def Task1_H2H_rg(hosts, onos_client):

    #Connect all hosts
    for host, value in hosts.items():
        found = False
        for host2, value2 in hosts.items():
            if host == host2:
                found = True
                continue
            if not found:
                continue

            # Create an isolated copy of the template.
            h2h_rb = copy.deepcopy(DefaultValues.H2HIntent_base)
            # Assign destination host.
            h2h_rb["one"] = value["id"]
            h2h_rb["two"] = value2["id"]

            print("Created Intent:")
            print(h2h_rb)
            # Install intent into ONOS.
            print(f"Resp: {onos_client.post_intent(h2h_rb)}")



def Task2_P2P_sfc(hosts, onos_client):

    #Connect Host1 and Host3 with a SFC over Switch 3
    # Create an isolated copy of the template.
    p2p = copy.deepcopy(DefaultValues.P2PIntent_base)


    p2p["ingressPoint"] = hosts["host1"]["devs"][0]
    p2p["egressPoint"] = hosts["host3"]["devs"][0]
    p2p["selector"]["criteria"].append({ "type": "ETH_TYPE", "ethType": "0x0800" })
    p2p["selector"]["criteria"].append({ "type": "IPV4_DST", "ip": f"{hosts['host3']['ipaddr']}/32" }) 
    p2p["selector"]["criteria"].append({ "type": "IPV4_SRC", "ip": f"{hosts['host1']['ipaddr']}/32" })
    

    p2p["constraints"]= [
        {
            "type": "WaypointConstraint",
            "waypoints":[
                "of:0000000000000003"
            ]
        }
    ]

    print("Created Intent:")
    print(p2p)
    # Install intent into ONOS.
    print(onos_client.post_intent(p2p))
    p2p = copy.deepcopy(DefaultValues.P2PIntent_base)


    p2p["ingressPoint"] = hosts["host3"]["devs"][0]
    p2p["egressPoint"] = hosts["host1"]["devs"][0]
    p2p["selector"]["criteria"].append({ "type": "ETH_TYPE", "ethType": "0x0800" })
    p2p["selector"]["criteria"].append({ "type": "IPV4_DST", "ip": f"{hosts['host1']['ipaddr']}/32" }) 
    p2p["selector"]["criteria"].append({ "type": "IPV4_SRC", "ip": f"{hosts['host3']['ipaddr']}/32" })
    

    p2p["constraints"]= [
        {
            "type": "WaypointConstraint",
            "waypoints":[
                "of:0000000000000003"
            ]
        }
    ]
    print("Created Intent:")
    print(p2p)
    print(onos_client.post_intent(p2p))

    #Connect Host1 and Host3 with a SFC over Switch 3
    # Create an isolated copy of the template.
    p2p = copy.deepcopy(DefaultValues.P2PIntent_base)


    p2p["ingressPoint"] = hosts["host2"]["devs"][0]
    p2p["egressPoint"] = hosts["host4"]["devs"][0]
    p2p["selector"]["criteria"].append({ "type": "ETH_TYPE", "ethType": "0x0800" })
    p2p["selector"]["criteria"].append({ "type": "IPV4_DST", "ip": f"{hosts['host4']['ipaddr']}/32" }) 
    p2p["selector"]["criteria"].append({ "type": "IPV4_SRC", "ip": f"{hosts['host2']['ipaddr']}/32" })
    

    p2p["constraints"]= [
        {
            "type": "WaypointConstraint",
            "waypoints":[
                "of:0000000000000002"
            ]
        }
    ]

    print("Created Intent:")
    print(p2p)
    # Install intent into ONOS.
    print(onos_client.post_intent(p2p))
    p2p = copy.deepcopy(DefaultValues.P2PIntent_base)


    p2p["ingressPoint"] = hosts["host4"]["devs"][0]
    p2p["egressPoint"] = hosts["host2"]["devs"][0]
    p2p["selector"]["criteria"].append({ "type": "ETH_TYPE", "ethType": "0x0800" })
    p2p["selector"]["criteria"].append({ "type": "IPV4_DST", "ip": f"{hosts['host2']['ipaddr']}/32" }) 
    p2p["selector"]["criteria"].append({ "type": "IPV4_SRC", "ip": f"{hosts['host4']['ipaddr']}/32" })

    p2p["constraints"]= [
        {
            "type": "WaypointConstraint",
            "waypoints":[
                "of:0000000000000002"
            ]
        }
    ]
    print("Created Intent:")
    print(p2p)
    print(onos_client.post_intent(p2p))


def Custom(hosts, onos_client):
    #Free for custom intents
    print("Custom")



# ------------------------------------------------------------------
# Remove every installed intent from ONOS.
# ------------------------------------------------------------------
def DeleteIntents(onos_client):

    for intent in onos_client.get_intents():

        onos_client.remove_intent(
            intent["appId"],
            intent["id"]
        )


# ------------------------------------------------------------------
# Main application entry point.
# Handles environment setup, topology startup, intent installation,
# and automated validation.
# ------------------------------------------------------------------
if __name__ == "__main__":

    parser = argparse.ArgumentParser(
        description="Onos Api Interaction Example"
    )

    # Environment management arguments.
    parser.add_argument("--clean", action='store_true',
                        help="Clean the whole system")

    parser.add_argument("--activate-apps", action='store_true',
                        help="Activates the apps")
    
    parser.add_argument("--delint", action='store_true',
                        help="Deletes all intents")  

    # Task selection arguments.
    parser.add_argument("--connectAll", action='store_true',
                        help="Connect all hosts with all hosts through intents")

    parser.add_argument("--SFC_Task2", action='store_true',
                        help="Executes Task 2, creating two business")

    parser.add_argument("--custom", action='store_true',
                        help="Execute Service Function Chaining task")

      

    # Parse arguments.
    args = parser.parse_args()

    # Clean existing topology and controller state.
    if args.clean:
        subprocess.run(
            ["sudo", "bash", "clean_all.sh"]
        )

    # Create ONOS API client.
    onos_client = OnosAPI.OnosAPI()

    # Authenticate with ONOS.
    onos_client.login()

    # Activate required applications if requested.
    if args.activate_apps:

        onos_client.activate_apps("application_list.txt")

        if not args.notestapps:
            onos_client.test_if_apps_activated(
                "application_list.txt"
            )

    # Retrieve host metadata.
    hosts = DefaultValues.GetHostData(onos_client,DefaultValues.HostData)
    for host, value in hosts.items():
        print(f"{host} : {value}")
    # Execute selected tasks.
    if args.delint:
        DeleteIntents(onos_client)
    
    if args.connectAll:

        Task1_H2H_rg(hosts, onos_client)

        print("Installed communication between Hosts")

    if args.SFC_Task2:

        Task2_P2P_sfc(hosts, onos_client)

    if args.custom:

        Custom(hosts, onos_client)

    