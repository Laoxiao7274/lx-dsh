/** Shell chrome and General-nav dictionaries; feature rows own their copy. */

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh = {
  'trigger': '设置',
  'title': '设置',
  'close': '关闭',
  'openDocument': '打开配置文件',
  'openDocument.error': '无法打开配置文件',
  'general.nav': '通用设置',
  'connection.error': '连接异常',
  'connection.retry': '立即重连',
  'connection.connecting': '连接中',
  'connection.connected': '连接成功',
  'connection.reconnect': '连接异常，点击立即重连',
  'connection.restart': '连接中，点击立即重连',
  'remoteAccess.title': '外网访问',
  'remoteAccess.description': '展示让其他客户端连接此后端的地址与令牌',
  'remoteAccess.loading': '正在读取连接信息…',
  'remoteAccess.unavailable': '连接信息读取失败',
  'remoteAccess.url': '地址',
  'remoteAccess.token': '访问密钥',
  'remoteAccess.lan': '局域网',
  'remoteAccess.copy': '复制',
  'remoteAccess.copied': '已复制',
  'remoteAccess.loopbackHint': '此后端目前只监听本机回环地址；要让外网设备连接，请以 --host 0.0.0.0 启动并放行防火墙端口。',
  'remoteAccess.exposedHint': '此后端已监听全部网卡；把下面的地址发给要连接的客户端即可（公网访问还需端口转发或公网 IP）。',
} satisfies Record<string, string>

/** The settings namespace key union. */
export type SettingsKey = keyof typeof zh

/** English dictionary, checked complete against the zh key set. */
export const en = {
  'trigger': 'Settings',
  'title': 'Settings',
  'close': 'Close',
  'openDocument': 'Open configuration file',
  'openDocument.error': 'Could not open configuration file',
  'general.nav': 'General',
  'connection.error': 'Disconnected',
  'connection.retry': 'Reconnect now',
  'connection.connecting': 'Connecting',
  'connection.connected': 'Connected',
  'connection.reconnect': 'Disconnected, reconnect now',
  'connection.restart': 'Connecting, restart now',
  'remoteAccess.title': 'Remote access',
  'remoteAccess.description': 'Show the address and token other clients need to reach this backend',
  'remoteAccess.loading': 'Reading connection info…',
  'remoteAccess.unavailable': 'Could not read connection info',
  'remoteAccess.url': 'Address',
  'remoteAccess.token': 'Access key',
  'remoteAccess.lan': 'LAN',
  'remoteAccess.copy': 'Copy',
  'remoteAccess.copied': 'Copied',
  'remoteAccess.loopbackHint': 'This backend listens on the loopback interface only; to let remote devices connect, start it with --host 0.0.0.0 and open the firewall port.',
  'remoteAccess.exposedHint': 'This backend listens on all interfaces; hand the address below to the client that should connect (public access additionally needs port forwarding or a public IP).',
} satisfies Record<SettingsKey, string>
