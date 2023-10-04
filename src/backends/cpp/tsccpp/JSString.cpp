#include <cstring>
#include <fmt/format.h>

class JSString {
  const char* _data;
  size_t _length;

public:
  JSString(const char* data) {
    this->_data = data;
    this->_length = strlen(data);
  }
  
  JSString(const char* data, size_t length) {
    this->_data = data;
    this->_length = length;
  }

  JSString(const JSString& source) {
    this->_data = source._data;
    this->_length = source._length;
  }

  JSString(JSString&& source) {
    this->_data = source._data;
    this->_length = source._length;
  }

  JSString operator+(const char* otherData) {
    size_t otherLength = strlen(otherData);
    size_t newLength = this->_length + otherLength;
    char* newData = new char[newLength + 1];

    strncpy(newData, this->_data, this->_length);
    strncpy(newData + this->_length, otherData, otherLength);
    newData[newLength] = '\0';

    return JSString(newData, newLength);
  }

  JSString operator+(JSString& other) {
    size_t newLength = this->_length + other._length;
    char* newData = new char[newLength + 1];

    strncpy(newData, this->_data, this->_length);
    strncpy(newData + this->_length, other._data, other._length);
    newData[newLength] = '\0';

    return JSString(newData, newLength);
  }

  const char* data() const {
    return this->_data;
  }

  size_t length() const {
    return this->_length;
  }
};

template<>
struct fmt::formatter<JSString>
{
  template<typename ParseContext>
  constexpr auto parse(ParseContext& ctx) {
    return ctx.begin();
  }

  template<typename FormatContext>
  auto format(JSString const& string, FormatContext& ctx) {
    return fmt::format_to(ctx.out(), "{0}", string.data());
  }
};
