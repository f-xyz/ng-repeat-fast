# ng-repeat-fast

crear: 226ms
back: 100ms

# Fast-Repeat on 10K elements

creating dom: 1.6s

event 1: removed all items
    * diff(): 3ms
    * DOM updating: 20ms
    * total $apply(): 100ms
event 1: leaved empty
    * diff(): 0
    * DOM updating: 0
    * total $apply(): 45ms
event 2: added all back
    * diff(): 3ms
    * DOM updating: 10ms
    * total $apply(): 60s

* Total 100 45 60

# Ng-Repeat on 10K elements

event 1: removed all items
    * total $apply(): 600ms
event 1: leaved empty
    * total $apply(): 20ms
event 2: added all back
    * total $apply(): 550ms

* Total: 600 20 550