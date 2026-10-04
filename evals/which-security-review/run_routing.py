#!/usr/bin/env python3
"""Run each query through `claude -p` N times with the real installed skill set;
record which skill (if any) Claude loads first. Expected labels:
which-* = that exact skill; reviewer = any non-router review skill/command; other = anything that is not a which-* router (incl. no skill)."""
import json, os, subprocess, sys
from concurrent.futures import ThreadPoolExecutor
HERE=os.path.dirname(os.path.abspath(__file__))
SET=sys.argv[2] if len(sys.argv)>2 else f"{HERE}/routing-eval-set.json"
OUT=sys.argv[3] if len(sys.argv)>3 else "routing_results.json"
REVIEWERS={"code-review","code-review-and-quality","security-review","security-and-hardening","review"}
ROUTERS={"which-codereview","which-security-review","which-framework"}
RUNS=int(sys.argv[1]) if len(sys.argv)>1 else 3
MODEL="claude-opus-5-5"

def first_skill(q):
    env={k:v for k,v in os.environ.items() if k!="CLAUDECODE"}
    p=subprocess.Popen(["claude","-p",q,"--output-format","stream-json","--verbose","--model",MODEL],
                       cwd=os.environ.get("ROUTING_CWD", "/tmp"),env=env,stdout=subprocess.PIPE,stderr=subprocess.DEVNULL,text=True)
    tools=0; res="none"
    try:
        for line in p.stdout:
            try: e=json.loads(line)
            except: continue
            if e.get("type")=="assistant":
                for c in e["message"]["content"]:
                    if c.get("type")!="tool_use": continue
                    tools+=1
                    if c["name"]=="Skill":
                        res=c["input"].get("skill","?").split(":")[-1]; return res
                    if tools>=4: return res
            if e.get("type")=="result": return res
    finally:
        p.kill()
    return res

def ok(exp,got):
    if exp in ROUTERS: return got==exp
    if exp=="reviewer": return got not in ROUTERS
    return got not in ROUTERS

items=json.load(open(SET))
jobs=[(i,r) for i in range(len(items)) for r in range(RUNS)]
with ThreadPoolExecutor(8) as ex:
    outs=list(ex.map(lambda j: (j[0], first_skill(items[j[0]]["query"])), jobs))
for i,it in enumerate(items):
    it["got"]=[g for k,g in outs if k==i]
    it["hits"]=sum(ok(it["expected"],g) for g in it["got"])
json.dump(items,open(OUT,"w"),indent=1)
for it in items:
    print(f"{it['hits']}/{RUNS}  {it['expected']:22} got={it['got']}  {it['query'][:60]}")
