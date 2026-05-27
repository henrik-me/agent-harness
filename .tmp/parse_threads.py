import json
d = json.load(open('.tmp/threads.json', encoding='utf-8'))
threads = d['data']['repository']['pullRequest']['reviewThreads']['nodes']
unresolved = [t for t in threads if not t['isResolved']]
print(f'TOTAL: {len(threads)}  UNRESOLVED: {len(unresolved)}')
for t in unresolved:
    c = t['comments']['nodes'][0]
    print('---')
    print(f"thread={t['id']} outdated={t['isOutdated']} path={c['path']}:{c['line']} created={c['createdAt']}")
    print(c['body'][:800].encode('ascii', 'replace').decode())
