import argparse
import subprocess
import OnosAPI
import json
import copy
import time
from itertools import combinations


import DefaultValues

# ------------------------------------------------------------------
# Construct the complete host data
# ------------------------------------------------------------------
def GetHostData(host_data_base):

    # Host information is currently statically defined because
    
    #Get all the data of the hosts associated with the ip address
    for host in onos_client.get_hosts():
        for host_name, value in host_data_base.items():
            if len(host.get("ipAddresses")) == 0:
                continue
            if host.get("ipAddresses")[0] == value["ipaddr"]:
                #Get the host id
                value["id"] = host.get("id")
                #Get the connections
                for device in host.get("locations"):
                    value["devs"].append({
                        "device" : device.get("elementId"),
                        "port" : device.get("port")
                    })
                break
    return host_data_base

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
    parser.add_argument("--noclean", action='store_true',
                        help="Prevents resetting Network state")

    parser.add_argument("--noactivate-apps", action='store_true',
                        help="Activates the apps")

    parser.add_argument("--nodelint", action='store_true',
                        help="Execute Service Function Chaining task")    

    # Parse arguments.
    args = parser.parse_args()

    # Clean existing topology and controller state.
    if not args.noclean:
        subprocess.run(
            ["sudo", "bash", "clean_all.sh"]
        )

    # Create ONOS API client.
    onos_client = OnosAPI.OnosAPI()

    # Authenticate with ONOS.
    onos_client.login()

    # Activate required applications if requested.
    if not args.noactivate_apps:

        onos_client.activate_apps("application_list.txt")

    # Retrieve host metadata.
    hosts = GetHostData(DefaultValues.HostData)
    for host, value in hosts.items():
        print(f"{host} : {value}")


    # Execute selected tasks.
    if not args.nodelint:
        DeleteIntents(onos_client)

    