#include <cstring>
#include <fmt/format.h>

namespace JS {
class String {
  const char* _data;
  size_t _length;

public:
  String(const char* data) {
    _data = data;
    _length = strlen(data);
  }
  
  String(const char* data, size_t length) {
    _data = data;
    _length = length;
  }

  String(const String& source) {
    _data = source._data;
    _length = source._length;
  }

  String(String&& source) {
    _data = source._data;
    _length = source._length;
  }

  String operator+(const char* otherData) const {
    size_t otherLength = strlen(otherData);
    size_t newLength = _length + otherLength;
    char* newData = new char[newLength + 1];

    strncpy(newData, _data, _length);
    strncpy(newData + _length, otherData, otherLength);
    newData[newLength] = '\0';

    return String(newData, newLength);
  }  

  String operator+(const String& other) const {
    size_t newLength = _length + other._length;
    char* newData = new char[newLength + 1];

    strncpy(newData, _data, _length);
    strncpy(newData + _length, other._data, other._length);
    newData[newLength] = '\0';

    return String(newData, newLength);
  }

  const char* data() const {
    return _data;
  }

  size_t length() const {
    return _length;
  }
};
}

template<>
struct fmt::formatter<JS::String>
{
  template<typename ParseContext>
  constexpr auto parse(ParseContext& ctx) {
    return ctx.begin();
  }

  template<typename FormatContext>
  auto format(JS::String const& string, FormatContext& ctx) {
    return fmt::format_to(ctx.out(), "{0}", string.data());
  }
};
