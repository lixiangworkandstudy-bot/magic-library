"""
serve.py — 本地开发服务器（端口 5103），和 python3 -m http.server 一样，
但每个响应都带 Cache-Control: no-store：改了文件，浏览器刷新就是最新版，不会读到缓存的旧 JS。

运行：
  python3 tools/serve.py          # 只有本机能访问
  python3 tools/serve.py --lan    # 同一 Wi-Fi 的 iPad / 手机也能访问
"""

import http.server
import os
import socketserver
import sys

PORT = 5103
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store, must-revalidate")
        super().end_headers()

    def do_POST(self):
        """
        开发用：页面把截下来的地点缩略图存回项目（POST /__save-thumb?name=desk，正文是 JPEG）。
        安全限制：只接受本机（127.0.0.1）的请求；只能写 assets/spots/<名字>.jpg，名字只能是字母数字和横线。
        """
        from urllib.parse import urlparse, parse_qs
        import re
        url = urlparse(self.path)
        name = (parse_qs(url.query).get("name") or [""])[0]
        # 经过隧道 / 代理转发的请求（外网来的）一律拒绝：它们在本机看起来也是 127.0.0.1，要看转发头
        forwarded = any(self.headers.get(h) for h in ("Cf-Connecting-Ip", "X-Forwarded-For", "Forwarded", "Cf-Ray"))
        if url.path != "/__save-thumb" or self.client_address[0] != "127.0.0.1" or forwarded or not re.fullmatch(r"[a-z0-9-]{1,32}", name):
            self.send_error(403)
            return
        length = int(self.headers.get("Content-Length", 0))
        if length <= 0 or length > 2_000_000:
            self.send_error(413)
            return
        data = self.rfile.read(length)
        if not data.startswith(b"\xff\xd8"):                  # 必须是 JPEG
            self.send_error(415)
            return
        out = os.path.join(ROOT, "assets", "spots", f"{name}.jpg")
        os.makedirs(os.path.dirname(out), exist_ok=True)
        with open(out, "wb") as f:
            f.write(data)
        self.send_response(200)
        self.end_headers()
        self.wfile.write(b"ok")


# 默认只给本机用；加 --lan 则监听所有网卡，同一 Wi-Fi 下的 iPad / 手机也能打开
HOST = "0.0.0.0" if "--lan" in sys.argv else "127.0.0.1"

def lan_ip():
    """本机在局域网里的 IP（iPad 上要输入的地址）。"""
    import socket
    import subprocess
    # macOS：直接问 Wi-Fi 网卡（en0 / en1）。开了代理/VPN 时"对外网卡"会是虚拟网卡（198.18.x.x），iPad 连不上那个
    for iface in ("en0", "en1"):
        try:
            ip = subprocess.run(["ipconfig", "getifaddr", iface], capture_output=True, text=True).stdout.strip()
            if ip:
                return ip
        except OSError:
            pass
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(("8.8.8.8", 80))   # 不会真的发数据，只是让系统选出对外的网卡
        return s.getsockname()[0]
    except OSError:
        return "127.0.0.1"
    finally:
        s.close()


socketserver.TCPServer.allow_reuse_address = True
try:
    httpd = socketserver.ThreadingTCPServer((HOST, PORT), NoCacheHandler)
except OSError as e:
    if e.errno == 48:   # 端口已被占用 = 服务已经在跑了，不用再开
        print(f"端口 {PORT} 已经有服务在运行，直接打开即可：")
        print(f"  本机： http://127.0.0.1:{PORT}/")
        print(f"  iPad： http://{lan_ip()}:{PORT}/   （需同一 Wi-Fi，且服务是用 --lan 启动的）")
        print(f"想重启：先运行  lsof -ti tcp:{PORT} | xargs kill  再启动")
        sys.exit(0)
    raise

with httpd:
    print(f"Serving {ROOT} (no-cache)")
    print(f"  本机： http://127.0.0.1:{PORT}/")
    if HOST == "0.0.0.0":
        print(f"  iPad： http://{lan_ip()}:{PORT}/")
    httpd.serve_forever()
