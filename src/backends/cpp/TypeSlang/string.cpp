#include <fmt/format.h>
#include <string>

namespace JS {
class String {
  std::string _data;

public:
  String(const char *data) { _data = std::string(data); }

  String(const char *data, size_t length) { _data = std::string(data, length); }

  String(std::string data) { _data = data; }

  String(const String &source) { _data = source._data; }

  String(String &&source) { _data = source._data; }

  String operator+(const char *other) const { return String(_data + other); }

  String operator+(const String &other) const { return String(_data + other._data); }

  template <typename... T> static String format(fmt::format_string<T...> format, T &&...args) {
    return String(fmt::format(format, std::forward<T>(args)...));
  }

  std::string data() const { return _data; }

  size_t length() const { return _data.size(); }
};
} // namespace JS

using string = JS::String;

template <> struct fmt::formatter<JS::String> {
  template <typename ParseContext> constexpr auto parse(ParseContext &ctx) { return ctx.begin(); }

  template <typename FormatContext> auto format(JS::String const &string, FormatContext &ctx) {
    return fmt::format_to(ctx.out(), "{}", string.data());
  }
};
